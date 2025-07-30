
import express from 'express';
import runsRoutes from './runs/route.js';
import integrationsRoutes from './integrations/routes.js';

const app = express();
app.use(express.json());

app.use('/runs', runsRoutes);
app.use('/integrations', integrationsRoutes);

const PORT = 3002;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`REST API server running on http://localhost:${PORT}`);
  });
}

export default app;
