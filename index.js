import express from "express";
import figlet from "figlet";
import bodyParser from "body-parser";
import morgan from "morgan";

import { randomUUID } from "node:crypto";
import { clearAllKeysFromCache, connectRedis } from "./helpers/redis.js";
import rabbit from "./helpers/rabbitMQ.js";
import env from "./config.js";
import logger from "./logger.js";
import { assertEqual, delay } from "./utils/index.js";
import stellarService from "./helpers/stellar.js";

const app = express();

app.use(bodyParser.json({ limit: "50mb" }));
app.use(morgan("tiny"));
app.use(express.static("public"));

await connectRedis();
await clearAllKeysFromCache();

const router = express.Router();

router.post("/api/v1/mint", async (req, res) => {
  const { assets, mock } = req.body;
  assertEqual(0 < assets.length, true, "No assets provided");
  assertEqual(assets.length <= 1, true, "Only one asset is allowed");
  try {
    const replyTo = randomUUID();
    const correlationId = randomUUID();
    // eslint-disable-next-line no-async-promise-executor
    const promise = new Promise(async (resolve, reject) => {
      const buff = JSON.stringify({
        data: {
          hash: assets[0].assetName,
        },
        options: {
          skipWait: false,
          mock: mock || false,
        },
        id: correlationId,
        type: "mint-token",
      });
      const TEN_MINUTES = 60 * 1000 * 10;
      const rpcClient = rabbit.createRPCClient({
        confirm: true,
        timeout: TEN_MINUTES,
      });
      const tim = delay(TEN_MINUTES).then(async () => {
        await rpcClient.close();
        reject("Time out");
      });
      const response = await rpcClient.send(
        {
          routingKey: env.SERVICE_NAME,
          replyTo: replyTo,
          correlationId: correlationId,
          durable: true,
        },
        buff
      );
      clearTimeout(tim);
      logger.debug(response);
      const body = JSON.parse(response.body);
      await rpcClient.close();
      resolve(body);
    });
    const result = await promise;
    return res.status(200).json({
      message: "Storing data successfully",
      data: result,
    });
  } catch (error) {
    logger.error(error);
    return res.status(200).json({
      error_message: error.message,
    });
  }
});

router.get("/api/v1/fetch", async (req, res) => {
  const { hash } = req.query;
  try {
    const result = await stellarService.getCert(hash);
    return res.status(200).json({
      message: "Data fetched successfully",
      data: result,
    });
  } catch (error) {
    logger.error(error);
    return res.status(200).json({
      error_message: error.message,
    });
  }
});

app.use(router);

router.get("/api/health", (req, res) => {
  return res.sendStatus(200);
});

app.all("*", (req, res) => {
  return res.sendStatus(404);
});

const StellarService = figlet.textSync(`${env.SERVICE_NAME}`);
console.info(StellarService);

const server = app.listen(env.PORT, () => {
  logger.info(`Server is running on port ${server.address().port}`);
});

process.on("SIGINT", () => {
  server.close();
  process.exit();
});
