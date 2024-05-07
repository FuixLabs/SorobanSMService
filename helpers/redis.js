import { createClient } from "redis";
import logger from "../logger.js";
import env from "../config.js";
const { REDIS_PASSWORD, REDIS_HOST, REDIS_PORT } = env;

const DEFAULT_EXPIRED_TIME = 60;

const redisClient = createClient({
  url: `redis://default:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}`,
});

/**
 * Constructs a Redis key based on the provided parameters.
 *
 * @param {Object} options - The options for constructing the Redis key.
 * @param {string} options.key - The key to be used in constructing the Redis key.
 * @returns {string} The constructed Redis key.
 */
const constructRedisKey = ({ key }) => {
  return process.env.NODE_ENV !== "test" ? key : `__test:${key}`;
};

/**
 * Retrieves data from the cache based on the provided key.
 * @param {Object} options - The options for retrieving data from the cache.
 * @param {string} options.key - The key used to retrieve data from the cache.
 * @returns {Promise<any>} A promise that resolves to the retrieved data from the cache.
 */
async function pullFromCache({ key }) {
  const data = await redisClient.get(key);
  return JSON.parse(data);
}

/**
 * Retrieves a value from the cache based on the provided key.
 * @param {Object} options - The options for retrieving the cache value.
 * @param {string} options.key - The key used to retrieve the cache value.
 * @returns {Promise<any>} - A promise that resolves to the retrieved cache value, or undefined if not found.
 */
async function getCacheValue({ key }) {
  const cacheKey = constructRedisKey({ key });
  try {
    const data = await pullFromCache({ key: cacheKey });
    if (typeof data === "string" && data === "{}") {
      return undefined;
    }
    return data;
  } catch (error) {
    logger.error(`Error while getting cache value for key ${key}`);
    logger.error(error);
    return undefined;
  }
}

/**
 * Sets a value in the cache with an optional expiration time.
 *
 * @param {Object} options - The options for setting the cache value.
 * @param {string} options.key - The key to use for storing the value in the cache.
 * @param {any} options.value - The value to be stored in the cache.
 * @param {number} [options.expiredTime=DEFAULT_EXPIRED_TIME] - The expiration time in seconds. Defaults to `DEFAULT_EXPIRED_TIME`.
 * @returns {Promise<void>} - A promise that resolves when the value is successfully set in the cache.
 */
async function setCacheValue({
  key,
  value,
  expiredTime = DEFAULT_EXPIRED_TIME,
}) {
  const cacheKey = constructRedisKey({ key });
  await redisClient.set(cacheKey, JSON.stringify(value));
  if (expiredTime > 0) {
    await redisClient.expire(cacheKey, expiredTime);
  }
}

/**
 * Deletes a cache value from Redis.
 *
 * @param {Object} options - The options for deleting the cache value.
 * @param {string} options.key - The key of the cache value to delete.
 * @returns {Promise<void>} - A Promise that resolves when the cache value is deleted.
 */
async function deleteCacheValue({ key }) {
  const cacheKey = constructRedisKey({ key });
  await redisClient.del(cacheKey);
}

/**
 * Clears all keys from the cache.
 * @returns {Promise<void>} A promise that resolves when all keys are cleared from the cache.
 */
async function clearAllKeysFromCache() {
  await redisClient.flushAll();
}

/**
 * Retrieves all keys from the cache.
 * @returns {Promise<Array<string>>} A promise that resolves to an array of keys.
 */
async function getAllKeysFromCache() {
  return await redisClient.sendCommand(["keys", "*"]);
}

/**
 * Finds keys in Redis with the specified prefix.
 * @param {string} prefix - The prefix to search for.
 * @returns {Promise<string[]>} - A promise that resolves to an array of keys matching the prefix.
 */
async function findKeysWithPrefix(prefix) {
  return await redisClient.keys(`${prefix}*`);
}

/**
 * Removes keys with the specified prefix from Redis.
 * @param {string} prefix - The prefix of the keys to be removed.
 * @returns {Promise<void>} - A Promise that resolves when the keys are successfully removed.
 */
async function removeKeysWithPrefix(prefix) {
  const keys = await findKeysWithPrefix(prefix);
  if (keys.length > 0) {
    await redisClient.del(keys);
  }
}

/**
 * Increases the value of a cache key in Redis and optionally sets an expiration time.
 *
 * @param {Object} options - The options for increasing the cache value.
 * @param {string} options.key - The cache key to increase the value of.
 * @param {number} [options.expiredTime=DEFAULT_EXPIRED_TIME] - The expiration time in seconds. Set to -1 to disable expiration.
 * @returns {Promise<number>} - A promise that resolves with the increased value of the cache key.
 */
async function increaseCacheValue({ key, expiredTime = DEFAULT_EXPIRED_TIME }) {
  const cacheKey = constructRedisKey({ key });
  const value = await redisClient.incr(cacheKey);
  if (expiredTime !== -1) {
    await redisClient.expire(cacheKey, expiredTime);
  }
  return value;
}

/**
 * Connects to Redis and sets a key-value pair.
 * @throws {Error} If there is an error while connecting to Redis.
 */
const connectRedis = async () => {
  try {
    logger.debug("Connecting to redis ...");
    await redisClient.connect();
    logger.debug("Redis client connected successfully");
    await redisClient.set("server", "Cardano Service");
  } catch (error) {
    logger.error("Error while connecting to redis ...");
    logger.error(error);
    throw error;
  }
};

process.on("SIGINT", () => {
  redisClient.quit();
});

process.on("SIGTERM", () => {
  redisClient.quit();
});

export {
  connectRedis,
  getCacheValue,
  setCacheValue,
  deleteCacheValue,
  clearAllKeysFromCache,
  getAllKeysFromCache,
  findKeysWithPrefix,
  removeKeysWithPrefix,
  increaseCacheValue,
};
