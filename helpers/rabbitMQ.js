import { Connection } from "rabbitmq-client";
import env from "../config.js";
import logger from "../logger.js";
import stellarService from "./stellar.js";
const { RABBITMQ_PORT, RABBITMQ_USER, RABBITMQ_PASSWORD, RABBITMQ_HOST } = env;

const rabbit = new Connection({
  hostname: RABBITMQ_HOST,
  username: RABBITMQ_USER,
  password: RABBITMQ_PASSWORD,
  port: RABBITMQ_PORT,
});

rabbit.on("error", (error) => {
  logger.error("🚨 RabbitMQ connection error", error);
});

logger.debug("RabbitMQ connection established");

const rpcServerHandler = async (request, reply) => {
  const { data, options, id, type } = JSON.parse(request.body);

  logger.debug(
    "[+] Received message",
    JSON.stringify({ data, options, id, type }, null, 2)
  );

  const correlationId = request?.correlationId;

  try {
    switch (type) {
      case "mint-token":
        {
          if (!data?.hash) {
            return;
          }
          const { hash } = data;
          const cert = await stellarService.storeCert(hash);
          await reply(
            JSON.stringify({
              id,
              type,
              data: {
                ...cert,
              },
            }),
            {
              correlationId,
            }
          );
        }
        break;
      default:
        break;
    }
  } catch (error) {
    logger.error("🚨 Error processing message", error);
    return await reply(
      JSON.stringify({
        data: {
          data,
          id,
          type,
        },
        error_message: error.message,
      }),
      {
        correlationId,
      }
    );
  }
  logger.debug("✅ Message processed successfully", id);
};

const rpcServers = [];
const rpcSet = new Set();

const initRpcServer = async () => {
  const { SERVICE_NAME = "StellarService" } = env;
  const queueNames = [SERVICE_NAME];
  for (const queueName of queueNames) {
    if (rpcSet.has(queueName)) {
      continue;
    }
    logger.debug(`Creating RPC server for queue: ${queueName}`);
    const rpcServer = rabbit.createConsumer(
      {
        queue: queueName,
        concurrency: 1,
      },
      rpcServerHandler
    );
    rpcServers.push(rpcServer);
    rpcServer.on("error", (error) => {
      logger.error(`RPC server error: ${error}`);
    });
    rpcServer.on("ready", () => {
      logger.debug(`🟢 RPC server for queue ${queueName} is ready`);
      rpcSet.add(queueName);
    });
  }
};

await initRpcServer();

const closeRabbitMQ = async () => {
  for (const rpcServer of rpcServers) {
    console.log("🛑 Closing RPC server");
    await rpcServer.close();
  }
  console.log("🛑 Closing RabbitMQ connection");
  await rabbit.close();
};

process.on("SIGINT", async () => {
  await closeRabbitMQ();
});

process.on("SIGTERM", async () => {
  await closeRabbitMQ();
});

export default rabbit;
