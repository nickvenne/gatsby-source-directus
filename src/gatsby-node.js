import origFetch from "node-fetch"
import fetchRetry from "@vercel/fetch-retry"
import { CODES } from './report'
import { polyfillImageServiceDevRoutes } from "gatsby-plugin-utils/polyfill-remote-file"

export const onCreateDevServer = ({ app }) => {
  polyfillImageServiceDevRoutes(app)
}

export { createSchemaCustomization } from "./create-schema-customization"
export { sourceNodes } from "./source-nodes"
export { createResolvers } from './create-resolvers'

const fetch = fetchRetry(origFetch)

const checkDirectusHost = (value) => {

  const domainRegex = /(?:(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9])|(?:localhost):?\d{0,10}/

  const host = value.match(domainRegex)
  if(host[0]) {
    return host[0]
  }
  
  throw new Error("Directus host is not valid.")
}

const validateDirectusAccess = async pluginOptions => {
  if(process.env.NODE_ENV === `test`) return undefined

  await fetch(
    `${pluginOptions.useSSL ? "https" : "http"}://${pluginOptions.host}/collections`,
    {
      headers: {
        Authorization: `Bearer ${pluginOptions.accessToken}`,
        "Content-Type": "application/json",
      }
    }
  ).then(res => res.ok)
  .then(ok => {
    if(!ok) {
      const errorMessage = `Directus API is not accessible. Please check your Directus API credentials.`
      throw new Error(errorMessage)
    }
  })

  return undefined
}

export const onPreInit = async ({ store, reporter }, pluginOptions) => {
  try {
    await import(`gatsby-plugin-image/graphql-utils`)
  } catch (err) {
    reporter.panic({
      id: CODES.GatsbyPluginMissing,
      context: {
        sourceMessage: `gatsby-plugin-image is missing from your project.\nPlease install "npm i gatsby-plugin-image".`,
      }
    })
  }

  // if gatsby-plugin-image is not configured
  if (
    !store
      .getState()
      .flattenedPlugins.find(plugin => plugin.name === `gatsby-plugin-image`)
  ) {
    reporter.panic({
      id: CODES.GatsbyPluginMissing,
      context: {
        sourceMessage: `gatsby-plugin-image is missing from your gatsby-config file.\nPlease add "gatsby-plugin-image" to your plugins array.`,
      },
    })
  }

}

export const pluginOptionsSchema = ({Joi}) => 
  Joi.object()
    .keys({
      host: Joi.string()
        .description(
          `The base host for all the API requests, e.g directus.test.com`
        )
        .required()
        .empty()
        .custom(checkDirectusHost),
      envId: Joi.string()
        .description(
          `The environment ID for the sync status, e.g. dev-123`
        )
        .default(null)
        .empty(),
      updatedAtKey: Joi.string()
        .description(
          `The key of the field that contains the last updated date, defaults to "date_updated`
        )
        .default("date_updated")
        .empty(),
      useSSL: Joi.boolean()
        .default(true)
        .empty(),
      pageLimit: Joi.number()
        .integer()
        .description(
          `Number of entries to retrieve from Directus at a time. Due to some technical limitations, the response payload should not be greater than 7MB when pulling content from Directus. If you encounter this issue you can set this param to a lower number than 100, e.g 50.`
        )
        .default(1000),
      assetDownloadWorkers: Joi.number()
        .integer()
        .description(
          `Number of workers to use when downloading directus assets. Due to technical limitations, opening too many concurrent requests can cause stalled downloads. If you encounter this issue you can set this param to a lower number than 50, e.g 25.`
        )
        .default(50),
      accessToken: Joi.string()
        .description(
          `Directus delivery api key`
        )
        .required()
        .empty(),
      downloadLocal: Joi.boolean()
        .description(
          `Downloads and caches DirectusAsset's to the local filesystem.`
        )
        .default(false),
      customResolvers: Joi.object()
        .description(
          `Custom resolvers to be added to the schema.`
        )
        .default({}),
      plugins: Joi.array()
    })
    .external(validateDirectusAccess)

