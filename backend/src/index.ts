import { server } from './app';

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`MindGraph backend running on port ${PORT}`);
});
