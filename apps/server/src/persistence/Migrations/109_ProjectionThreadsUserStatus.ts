/**
 * Adds the user-assigned triage status ("Move to Status") to projected threads
 * so the sidebar status survives restarts and flows through shell snapshots.
 */
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { columnExists } from "./schemaHelpers.ts";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  if (yield* columnExists(sql, "projection_threads", "user_status")) {
    return;
  }

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN user_status TEXT
  `;
});
