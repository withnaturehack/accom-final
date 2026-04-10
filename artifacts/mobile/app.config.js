const PROD_API = "https://zip-12--vpahaddevbhoomi.replit.app/api";

module.exports = function applyAppConfig({ config }) {
  const explicitApiUrl = process.env.EXPO_PUBLIC_API_URL;
  const proxyUrl = process.env.EXPO_PUBLIC_WEB_ORIGIN || "https://localhost";

  // IMPORTANT: never fall back to localhost — real devices cannot reach it.
  // Always use the production API unless an explicit override is provided.
  const apiUrl = explicitApiUrl || PROD_API;

  return {
    ...config,
    plugins: (config.plugins || []).map((plugin) => {
      if (Array.isArray(plugin) && plugin[0] === "expo-router") {
        return [plugin[0], { ...plugin[1], origin: proxyUrl }];
      }
      return plugin;
    }),
    extra: {
      ...config.extra,
      apiUrl,
      router: {
        ...config.extra?.router,
        origin: proxyUrl,
        headOrigin: proxyUrl,
      },
    },
  };
};
