import { drizzle } from "drizzle-orm/d1";
import { schema } from "./schema";
import type { AppBindings } from "../types";

export function getDb(env: Pick<AppBindings, "DB">) {
	return drizzle(env.DB, { schema });
}
