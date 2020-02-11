import { LighthouseTask } from './library';

new LighthouseTask().run().then(
  () => {
    console.log('Lighthouse task finished');
    process.exit(0);
  },
  err => {
    console.error(err);
    process.exit(1);
  }
);
