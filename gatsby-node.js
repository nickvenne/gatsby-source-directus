"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

exports.__esModule = true;
exports.sourceNodes = exports.pluginOptionsSchema = exports.onPreInit = exports.onCreateDevServer = exports.createSchemaCustomization = void 0;

var _nodeFetch = _interopRequireDefault(require("node-fetch"));

var _fetchRetry = _interopRequireDefault(require("@vercel/fetch-retry"));

var _report = require("./report");

var _polyfillRemoteFile = require("gatsby-plugin-utils/polyfill-remote-file");

var _os = _interopRequireDefault(require("os"));

var _createSchemaCustomization = require("./create-schema-customization");

exports.createSchemaCustomization = _createSchemaCustomization.createSchemaCustomization;

var _sourceNodes = require("./source-nodes");

exports.sourceNodes = _sourceNodes.sourceNodes;

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

const onCreateDevServer = ({
  app
}) => {
  (0, _polyfillRemoteFile.polyfillImageServiceDevRoutes)(app);
};

exports.onCreateDevServer = onCreateDevServer;
const fetch = (0, _fetchRetry.default)(_nodeFetch.default);

const validateDirectusAccess = async pluginOptions => {
  if (process.env.NODE_ENV === `test`) return undefined;
  await fetch(`${pluginOptions.useSSL ? "https" : "http"}://${pluginOptions.host}/collections`, {
    headers: {
      Authorization: `Bearer ${pluginOptions.accessToken}`,
      "Content-Type": "application/json"
    }
  }).then(res => res.ok).then(ok => {
    if (!ok) {
      const errorMessage = `Directus API is not accessible. Please check your Directus API credentials.`;
      throw new Error(errorMessage);
    }
  });
  return undefined;
};

const onPreInit = async ({
  store,
  reporter
}, pluginOptions) => {
  try {
    await Promise.resolve().then(() => _interopRequireWildcard(require(`gatsby-plugin-image/graphql-utils`)));
  } catch (err) {
    reporter.panic({
      id: _report.CODES.GatsbyPluginMissing,
      context: {
        sourceMessage: `gatsby-plugin-image is missing from your project.\nPlease install "npm i gatsby-plugin-image".`
      }
    });
  } // if gatsby-plugin-image is not configured


  if (!store.getState().flattenedPlugins.find(plugin => plugin.name === `gatsby-plugin-image`)) {
    reporter.panic({
      id: _report.CODES.GatsbyPluginMissing,
      context: {
        sourceMessage: `gatsby-plugin-image is missing from your gatsby-config file.\nPlease add "gatsby-plugin-image" to your plugins array.`
      }
    });
  }
};

exports.onPreInit = onPreInit;

const pluginOptionsSchema = ({
  Joi
}) => Joi.object().keys({
  host: Joi.string().description(`The base host for all the API requests`).required().empty(),
  updatedAtKey: Joi.string().description(`The key of the field that contains the last updated date, defaults to "date_updated`).default("date_updated").empty(),
  useSSL: Joi.boolean().default(true).empty(),
  pageLimit: Joi.number().integer().description(`Number of entries to retrieve from Directus at a time. Due to some technical limitations, the response payload should not be greater than 7MB when pulling content from Directus. If you encounter this issue you can set this param to a lower number than 100, e.g 50.`).default(1000),
  assetDownloadWorkers: Joi.number().integer().description(`Number of workers to use when downloading directus assets. Due to technical limitations, opening too many concurrent requests can cause stalled downloads. If you encounter this issue you can set this param to a lower number than 50, e.g 25.`).default(50),
  accessToken: Joi.string().description(`Directus delivery api key, when using the Preview API use your Preview API key`).required().empty(),
  downloadLocal: Joi.boolean().description(`Downloads and caches DirectusAsset's to the local filesystem.`).default(false),
  plugins: Joi.array()
}).external(validateDirectusAccess);

exports.pluginOptionsSchema = pluginOptionsSchema;