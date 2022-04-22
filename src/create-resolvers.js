export const createResolvers = async ({createResolvers}, pluginOptions) => {
  const resolvers = pluginOptions.customResolvers
  createResolvers(resolvers)
}