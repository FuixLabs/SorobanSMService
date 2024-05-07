import * as StellarSdk from "@stellar/stellar-sdk";
import { delay, readFile, typeOf, TYPES } from "../utils/index.js";
import path from "path";
import env from "../config.js";
import logger from "../logger.js";
import { getCacheValue, setCacheValue } from "./redis.js";
const { PORT, SOROBAN_CONTRACT_ADDRESS, SOROBAN_RPC_SERVER } = env;

const {
  Keypair,
  Contract,
  SorobanRpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
} = StellarSdk;

const secretFile = await readFile(
  path.resolve(process.cwd(), "helpers", "secretKeys.json"),
  true
);

const secretKeys = secretFile["secretKeys"];
const secretKey = secretKeys[PORT % secretKeys.length];

const METHODS = {
  STORE_CERT: "store_cert",
  UPDATE_CERT: "update_cert",
  GET_CERT: "get_cert",
  IS_EXIST: "is_exist",
};

const TX_STATUS = {
  PENDING: "PENDING",
  SUCCESS: "SUCCESS",
  NOT_FOUND: "NOT_FOUND",
};

const CACHE_EXPIRATION = 60 * 60 * 24 * 7;

class StellarService {
  constructor() {
    this.keypair = this.loadKeyPair(secretKey);
    this.contract = new Contract(SOROBAN_CONTRACT_ADDRESS);
    this.server = new SorobanRpc.Server(SOROBAN_RPC_SERVER);
    this.network = Networks.TESTNET;
  }

  createKeyPair() {
    const pair = Keypair.random();
    return {
      publicKey: pair.publicKey(),
      secret: pair.secret(),
    };
  }

  loadKeyPair(secretKey) {
    return Keypair.fromSecret(secretKey);
  }

  getAccount() {
    return this.account;
  }

  getContract() {
    return this.contract;
  }

  getRpcServer() {
    return this.server;
  }

  async sendTx(preparedTransaction) {
    let sendResponse = await this.server.sendTransaction(preparedTransaction);
    logger.debug(`Sent transaction: ${JSON.stringify(sendResponse)}`);

    if (sendResponse.status === TX_STATUS.PENDING) {
      let getResponse = await this.server.getTransaction(sendResponse.hash);

      while (getResponse.status === TX_STATUS.NOT_FOUND) {
        logger.debug("Waiting for transaction confirmation...");
        getResponse = await this.server.getTransaction(sendResponse.hash);
        await delay(1000);
      }

      if (getResponse.status === TX_STATUS.SUCCESS) {
        if (!getResponse.resultMetaXdr) {
          throw "Empty .resultMetaXDR in getTransaction response";
        }
        const data = {
          txHash: sendResponse.hash,
        };
        let returnValue = getResponse.returnValue.value();
        if (typeOf(returnValue) === TYPES.Boolean) {
          return returnValue;
        }
        if (typeOf(returnValue) !== TYPES.Array) {
          throw `Unknown type: ${typeOf(returnValue)}`;
        }
        for (let i = 0; i < returnValue.length; i++) {
          const key = returnValue[i].key().value();
          const val = returnValue[i].val().value();
          try {
            switch (typeOf(val)) {
              case TYPES.Number:
                data[key.toString("utf8")] = val;
                break;
              case TYPES.Uint8Array:
                data[key.toString("utf8")] = val.toString("utf8");
                break;
              default:
                logger.error(`Unknown type: ${typeOf(val)}`);
                break;
            }
            // eslint-disable-next-line no-unused-vars
          } catch (_) { ; }
        }
        return data;
      } else {
        throw `Transaction failed: ${getResponse.resultXdr}`;
      }
    } else {
      throw sendResponse.errorResultXdr;
    }
  }

  async call(method, ...args) {
    const sourceAccount = await this.server.getAccount(
      this.keypair.publicKey()
    );
    let builtTransaction = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.network,
    })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(0)
      .build();
    let preparedTransaction =
      await this.server.prepareTransaction(builtTransaction);
    preparedTransaction.sign(this.keypair);
    const data = await this.sendTx(preparedTransaction);
    return data;
  }

  async storeCert(hash) {
    const data = await this.call(
      METHODS.STORE_CERT,
      StellarSdk.xdr.ScVal.scvString(hash)
    );
    this.__setCache(hash, data);
    return data;
  }

  async updateCert(hash, newHash) {
    const data = await this.call(
      METHODS.UPDATE_CERT,
      StellarSdk.xdr.ScVal.scvString(hash),
      StellarSdk.xdr.ScVal.scvString(newHash)
    );
    this.__setCache(newHash, data);
    return data;
  }

  async getCert(hash) {
    const cached = await this.__getFromCache(hash);
    if (cached) {
      return cached;
    }
    const data = await this.call(
      METHODS.GET_CERT,
      StellarSdk.xdr.ScVal.scvString(hash)
    );
    this.__setCache(hash, data);
    return data;
  }

  async isExists(hash) {
    const cached = await this.__getFromCache(hash);
    if (cached) {
      return cached;
    }
    const data = await this.call(
      METHODS.IS_EXIST,
      StellarSdk.xdr.ScVal.scvString(hash)
    );
    this.__setCache(hash, data);
    return data;
  }

  // ** Cache related methods ** //
  __constructRedisKey(hash) {
    return `stellar:cert:${hash}`;
  }

  async __getFromCache(hash) {
    const key = this.__constructRedisKey(hash);
    const data = await getCacheValue({ key });
    return data;
  }

  async __setCache(hash, data) {
    const key = this.__constructRedisKey(hash);
    await setCacheValue({ key, value: data, expiredTime: CACHE_EXPIRATION });
  }
}

export default new StellarService();
