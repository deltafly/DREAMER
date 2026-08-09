#!/bin/sh
#
# Applies pending migrations, then starts the server.
#
# Migrations belong here rather than in the build for two reasons. The obvious
# one is that a build has no business writing to a database. The one that
# actually bit: the Dockerfile used to run `prisma migrate deploy || true` in
# the builder stage, where the database does not exist — `db/` is excluded by
# .dockerignore and the real file is volume-mounted at runtime. So the command
# ran against nothing, failed, was swallowed by `|| true`, and the production
# database was never migrated at all. A container would start happily on a
# schema older than its code and fail later, at runtime, in whichever request
# first touched a missing column.
#
# There is no `|| true` here on purpose. If a migration cannot be applied, the
# container must refuse to start: a server running against the wrong schema is
# worse than a server that is plainly down, because it looks like it works.

set -e

echo "Applying database migrations..."
bunx prisma migrate deploy

echo "Starting OneBrainer..."
exec bun server.js
