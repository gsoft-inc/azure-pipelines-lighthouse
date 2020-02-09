const fs = require('fs');
const path = require('path');
const process = require('process');
const { exec } = require('child_process');
const minimist = require('minimist');

async function getPublishedVersion(token, publisher, extensionId) {
  return new Promise((resolve, reject) => {
    const execCmd = `tfx extension show -t ${token} --publisher ${publisher} --extension-id ${extensionId} --json`;
    const execOptions = {
      maxBuffer: 1024 * 1024 * 512
    };
    exec(execCmd, execOptions, (err, stdout, stderr) => {
      if (err) {
        reject({ err, stderr });
        return;
      }

      const extensionData = JSON.parse(stdout);
      if (!extensionData) {
        // Default to 1.0.0 if no extension is found in the market
        resolve({ major: 1, minor: 0, patch: 0 });
        return;
      }

      try {
        const [major, minor, patch] = extensionData.versions[0].version.split('.');
        resolve({
          major: Number(major),
          minor: Number(minor),
          patch: Number(patch)
        });
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function getJsonContent(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, jsonString) => {
      if (err) {
        reject(`Error reading file from disk: ${err}`);
        return;
      }

      try {
        resolve(JSON.parse(jsonString));
      } catch (err) {
        reject(`Error parsing JSON string: ${err}`);
      }
    });
  });
}

async function setJsonContent(filePath, content) {
  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, JSON.stringify(content, null, 2), err => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function updateJsonContent(filePath, update) {
  const content = await getJsonContent(filePath);
  update(content);
  await setJsonContent(filePath, content);
  console.log(`Updated file: ${filePath}`);
}

const releaseTypes = new Set(['dev', 'hotfix', 'prod']);

const run = async args => {
  if (!args.token) throw new Error('Argument --token is missing (Azure DevOps PAT token for VS Marketplace)');

  if (!args['release-type'] || !releaseTypes.has(args['release-type']))
    throw new Error('Argument --release-type is missing (valid values: dev, hotfix, prod)');

  console.log(`Updating extension information for ${args['release-type']}`);

  const settings = {
    id: 'lighthouse-vsts',
    name: 'Lighthouse',
    publisher: 'GSoft',
    version: { major: 1, minor: 0, patch: 0 },
    galleryFlags: ['Public'],
    public: true
  };

  const prodVersion = await getPublishedVersion(args.token, settings.publisher, settings.id);
  console.log('Current production extension version:', JSON.stringify(prodVersion, null, 2));

  switch (args['release-type']) {
    case 'dev':
      settings.id += '-dev';
      settings.name += ' (dev)';
      settings.publisher = 'gsoft-dev';
      settings.galleryFlags = ['Preview'];
      settings.public = false;

      const devVersion = await getPublishedVersion(args.token, settings.publisher, settings.id);
      console.log('Current development extension version:', JSON.stringify(devVersion, null, 2));

      settings.version.major = Math.max(prodVersion.major, devVersion.major);
      settings.version.minor = Math.max(prodVersion.minor, devVersion.minor);
      settings.version.patch = prodVersion.major !== devVersion.major || prodVersion.minor !== devVersion.minor ? 1 : devVersion.patch + 1;
      break;
    case 'hotfix':
      settings.version = prodVersion;
      settings.version.patch++;
      break;
    case 'prod':
      settings.version = prodVersion;
      settings.version.minor++;
      settings.version.patch = 0;
      break;
  }

  console.log('New extension information will be:', JSON.stringify(settings, null, 2));

  const vssExtensionJsonPath = path.resolve(__dirname, 'vss-extension.json');
  await updateJsonContent(vssExtensionJsonPath, content => {
    content.id = settings.id;
    content.version = `${settings.version.major}.${settings.version.minor}.${settings.version.patch}`;
    content.name = settings.name;
    content.publisher = settings.publisher;
    content.galleryFlags = settings.galleryFlags;
  });

  const taskJsonPath = path.resolve(__dirname, 'task/src/task.json');
  await updateJsonContent(taskJsonPath, content => {
    content.version = {
      Major: settings.version.major,
      Minor: settings.version.minor,
      Patch: settings.version.patch
    };
  });
};

const args = minimist(process.argv.slice(2), {
  string: ['token', 'release-type'],
  default: { 'release-type': 'dev' }
});

run(args).then(
  () => {
    console.log('Version bump finished');
    process.exit(0);
  },
  err => {
    console.error(err);
    process.exit(1);
  }
);
