export * from "./auth-schema.generated";
export * from "./app-schema";

import * as appSchema from "./app-schema";
import * as authSchema from "./auth-schema.generated";

export const schema = {
	...authSchema,
	...appSchema,
};
