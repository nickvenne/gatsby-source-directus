# gatsby-source-directus9

> Source plugin for pulling content, and assets into Gatsby from
> Directus CMS.
>
> NOTE: This source plugin requires custom directus extensions
> to function properly which are still in development

## Install

```shell
npm install gatsby-source-directus9
```

## How to use

First, you need a way to pass environment variables to the build process, so secrets and other secured data aren't committed to source control. We recommend using [`dotenv`][dotenv] which will then expose environment variables. [Read more about `dotenv` and using environment variables here][envvars]. Then we can _use_ these environment variables and configure our plugin.

## Restrictions and limitations

This plugin has several limitations, please be aware of these:

1. All sync content requires a _updated date_ field which can be set in the plugin options. Make sure this value is updated even on create.

2. References are only attached to content that have a valid relationship. e.g a M2M from A <-> B, which was created from A, there will be a reference from A to B but no reverse from B to A. You will need to also create a field on B.

3. Syncing works from the current env you are running, called from `os.userInfo()`, This is used to remember the difference from the last sync from your environment.

### Usage

```javascript
// In your gatsby-config.js
module.exports = {
  plugins: [
    {
      resolve: `gatsby-source-directus9`,
      options: {
        host: `directus.example.com`,
        // Learn about environment variables: https://gatsby.dev/env-vars
        accessToken: process.env.DIRECTUS_ACCESS_TOKEN,
      },
    },
  ],
}
```

### Configuration options

**`accessToken`** [string][required]

Directus Access Token, generated on a user with read permissions to content being request.

**`host`** [string][required]

The host for the directus instance. e.g 
`directus.example.com`

**`useSSL`** [boolean][optional] [default: true]

Send api calls using https vs http. Usefull for connecting to a local instance of directus.

**`updatedAtKey`** [string][optional] [default: `date_updated`]

The key for the field which saves the date updated on every piece of content. Only requried when **not** using directus system default `date_updated` field.

**`downloadLocal`** [boolean][optional] [default: `false`]

Downloads and caches `DirectusAssets`'s to the local filesystem. Allows you to query a `DirectusAssets`'s `localFile` field

**`pageLimit`** [number][optional] [default: `100`]

Number of entries to retrieve from Directus at a time. If you run into payload size limit issues, try to reduce this number to e.g `50`

**`assetDownloadWorkers`** [number][optional] [default: `50`]

Number of workers to use when downloading Directus assets. Due to technical limitations, opening too many concurrent requests can cause stalled downloads. If you encounter this issue you can set this param to a lower number than 50, e.g 25.



[dotenv]: https://github.com/motdotla/dotenv
[envvars]: https://gatsby.dev/env-vars