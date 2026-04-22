import { server } from './app';
import { setupCronJobs } from './lib/cron';

setupCronJobs();

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`MindGraph backend running on port ${PORT}`);
});
