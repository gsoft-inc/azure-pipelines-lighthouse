const fs = require('fs');
const path = require('path');
const process = require('process');
const minimist = require('minimist');

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

const environments = new Set(['dev', 'prod']);
const versionRegex = /^([0-9]+)\.([0-9]+)\.([0-9]+)$/;

const run = async args => {
  const token = args.token || '';
  const version = args.version || '';
  const environment = args.environment || '';

  if (token === '') {
    throw new Error('Argument --token is missing (Azure DevOps PAT token for VS Marketplace)');
  }

  if (!versionRegex.test(version)) {
    throw new Error('Argument --version is missing or invalid (x.y.z)');
  }

  if (!environments.has(environment)) {
    throw new Error('Argument --environment is missing or invalid (dev or prod only)');
  }

  const [, major, minor, patch] = version.match(versionRegex);
  console.log(`Updating extension to version ${major}.${minor}.${patch} for environment ${environment}`);

  const settings = {
    id: 'lighthouse-vsts',
    name: 'Lighthouse',
    publisher: 'GSoft',
    version: { major: Number(major), minor: Number(minor), patch: Number(patch) },
    galleryFlags: ['Public'],
    public: true
  };

  if (environment === 'dev') {
    settings.id += '-dev';
    settings.name += ' (dev)';
    settings.publisher = 'gsoft-dev';
    settings.galleryFlags = ['Preview'];
    settings.public = false;
  }

  console.log('New extension information will be:', JSON.stringify(settings, null, 2));

  const vssExtensionJsonPath = path.resolve(__dirname, 'vss-extension.json');
  await updateJsonContent(vssExtensionJsonPath, content => {
    content.id = settings.id;
    content.version = `${settings.version.major}.${settings.version.minor}.${settings.version.patch}`;
    content.name = settings.name;
    content.publisher = settings.publisher;
    content.galleryFlags = settings.galleryFlags;
    content.public = settings.public;
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
  string: ['token', 'version', 'environment'],
  default: { }
});

run(args).then(
  () => {
    console.log('Version update finished');
    process.exit(0);
  },
  err => {
    console.error(err);
    process.exit(1);
  }
);
