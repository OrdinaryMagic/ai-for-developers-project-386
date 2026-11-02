import type { FastifyPluginAsync } from "fastify";

const rootRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => {
    return { hello: "world" };
  });
};

export default rootRoutes;
