// Vercel serverless entrypoint.
// Every request to /api/* is handled by the Express app defined in server/index.js.
module.exports = require("../server/index.js");
