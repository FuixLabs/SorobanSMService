import dotenv from "dotenv";
dotenv.config();
import { cleanEnv, str, port } from "envalid";

const env = cleanEnv(process.env, {
  REDIS_PASSWORD: str({
    default: "Y0urP@ssw0rd",
  }),
  REDIS_HOST: str({
    default: "localhost",
  }),
  REDIS_PORT: port({
    default: 6399,
  }),
  RABBITMQ_HOST: str({
    default: "localhost",
  }),
  RABBITMQ_USER: str({
    default: "guest",
  }),
  RABBITMQ_PASSWORD: str({
    default: "guest",
  }),
  RABBITMQ_PORT: port({
    default: 5672,
  }),
  SERVICE_NAME: str({
    default: "StellarService",
  }),
  PORT: port({
    default: 40400,
  }),
  SOROBAN_CONTRACT_ADDRESS: str({
    // default: "CDC5M6DF72BXBWVAVAQSGVDNMDT7VU4CRJQSR75YVMUSESJV6B27O6OI",
    default: "CDIZVEQXERD7HXKFWUSDMHUPCHSG4BMFDYOGK3JLMU4AWMON7UCFRMDL",
  }),
  SOROBAN_RPC_SERVER: str({
    default: "https://soroban-testnet.stellar.org:443",
  }),
});

export default env;
