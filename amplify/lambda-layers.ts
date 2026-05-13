// Lambda Layer references — centralized so the ARN updates in one place
// when we republish the layer.
//
// The libsql layer was created out-of-band (CloudShell / IAM user with
// lambda:PublishLayerVersion). It contains @libsql/client and its Linux
// x86_64 native binaries (@libsql/linux-x64-gnu, @libsql/linux-x64-musl).
//
// To bump the version: rebuild the layer zip with `npm install @libsql/client
// --os=linux --cpu=x64` inside a `nodejs/` folder, publish via
// `aws lambda publish-layer-version --layer-name liveavatar-libsql ...`,
// and replace the ARN below.

const LIBSQL_LAYER_ARN =
  "arn:aws:lambda:us-east-1:301641292312:layer:liveavatar-libsql:1";

/**
 * Pass this to defineFunction's `layers` option for any Lambda that imports
 * from `lib/prisma.js`. The key — module name — tells Amplify Gen 2 to mark
 * `@libsql/client` as external in the esbuild bundle, so the runtime loads
 * it from the layer at `/opt/nodejs/node_modules/@libsql/client` instead of
 * the (broken) bundled copy.
 */
export const LIBSQL_LAYER = {
  "@libsql/client": LIBSQL_LAYER_ARN,
};
