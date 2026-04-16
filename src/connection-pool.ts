import type { ConnectionConfig, QueryResult } from "./types.js";
import { queryMysql, listTablesMysql, describeTableMysql, closeMysqlPools } from "./drivers/mysql.js";
import { queryPostgres, listTablesPostgres, describeTablePostgres, closePostgresPools } from "./drivers/postgres.js";
import { queryRedis, closeRedisClients } from "./drivers/redis.js";
import { queryMongo, listCollectionsMongo, closeMongoClients } from "./drivers/mongo.js";

export async function execQuery(poolKey: string, config: ConnectionConfig, sql: string): Promise<QueryResult> {
  switch (config.type) {
    case "mysql":
      return queryMysql(poolKey, config, sql);
    case "postgres":
      return queryPostgres(poolKey, config, sql);
    default:
      throw new Error(`Use query tool for SQL databases. For ${config.type}, use the dedicated tools.`);
  }
}

export async function execListTables(poolKey: string, config: ConnectionConfig): Promise<string[]> {
  switch (config.type) {
    case "mysql":
      return listTablesMysql(poolKey, config);
    case "postgres":
      return listTablesPostgres(poolKey, config);
    case "mongo":
      return listCollectionsMongo(poolKey, config);
    default:
      throw new Error(`list_tables not supported for ${config.type}`);
  }
}

export async function execDescribeTable(poolKey: string, config: ConnectionConfig, table: string): Promise<QueryResult> {
  switch (config.type) {
    case "mysql":
      return describeTableMysql(poolKey, config, table);
    case "postgres":
      return describeTablePostgres(poolKey, config, table);
    default:
      throw new Error(`describe_table not supported for ${config.type}`);
  }
}

export { queryRedis } from "./drivers/redis.js";
export { queryMongo } from "./drivers/mongo.js";

export async function closeAll(): Promise<void> {
  await Promise.all([
    closeMysqlPools(),
    closePostgresPools(),
    closeRedisClients(),
    closeMongoClients(),
  ]);
}
