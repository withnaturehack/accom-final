const { getDefaultConfig } = require("expo/metro-config");
const { createProxyMiddleware } = require("http-proxy-middleware");

const config = getDefaultConfig(__dirname);

const apiProxy = createProxyMiddleware({
  target: "http://127.0.0.1:8080",
  changeOrigin: false,
  logLevel: "silent",
});

config.server = config.server || {};
config.server.enhanceMiddleware = (metroMiddleware) => {
  return (req, res, next) => {
    if (req.url && (req.url === "/api" || req.url.startsWith("/api/"))) {
      apiProxy(req, res, next);
    } else {
      metroMiddleware(req, res, next);
    }
  };
};

module.exports = config;
