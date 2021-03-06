import {
  Rule,
  SchematicContext,
  Tree,
  apply,
  chain,
  mergeWith,
  template,
  url,
  noop,
  FileEntry,
  forEach,
} from '@angular-devkit/schematics';
import { NodePackageInstallTask } from '@angular-devkit/schematics/tasks';

import { Schema } from './schema';
import { getPackageJson, overwritePackageJson } from '../utils';

export default (options: Schema): Rule => {
  return chain([
    addDependencies(options),
    addCommitlintConfigFile(options),
    addDependency(options.husky) ? addHuskyConfig(options) : noop(),
    addDependency(options.commitizen) ? addCommitizenConfig(options) : noop(),
    addDependency(options.standardVersion) ? addNpmRunScript(options) : noop(),
    addDependency(options.standardVersion) && options.issuePrefix
      ? standardVersionConfig(options)
      : noop(),
    options.skipInstall ? noop() : installDependencies,
  ]);
};

const addDependency = (configForDependency: boolean | undefined) => {
  return configForDependency === true || typeof configForDependency === 'undefined';
};

const addDependencies = (options: Schema) => (tree: Tree, context: SchematicContext) => {
  context.logger.info('Added npm packages as dev dependencies');
  const packageJson = getPackageJson(tree);

  let devDepsToAdd: { [key: string]: string } = {
    '@commitlint/cli': '^8.2.0',
    '@commitlint/config-conventional': '^8.2.0',
  };

  if (addDependency(options.commitizen)) {
    devDepsToAdd = {
      ...devDepsToAdd,
      commitizen: '^4.0.3',
      'cz-conventional-changelog': '^3.0.2',
    };
  } else {
    context.logger.info('- Skips adding commitizen');
  }

  if (addDependency(options.husky)) {
    devDepsToAdd = {
      ...devDepsToAdd,
      husky: '^3.0.9',
    };
  } else {
    context.logger.info('- Skips adding husky');
  }

  if (addDependency(options.standardVersion)) {
    devDepsToAdd = {
      ...devDepsToAdd,
      'standard-version': '^7.0.0',
    };
  } else {
    context.logger.info('- Skips adding standard-version');
  }

  packageJson.devDependencies = {
    ...packageJson.devDependencies,
    ...devDepsToAdd,
  };

  overwritePackageJson(tree, packageJson);
};

const addNpmRunScript = (options: Schema) => (tree: Tree, context: SchematicContext) => {
  context.logger.info('Added npm script for release');
  const packageJson = getPackageJson(tree);

  const scriptsToAdd = {
    release: 'standard-version',
  };
  if (options.force) {
    packageJson.scripts = { ...packageJson.scripts, ...scriptsToAdd };
  } else {
    packageJson.scripts = { ...scriptsToAdd, ...packageJson.scripts };
  }

  overwritePackageJson(tree, packageJson);
};

const addHuskyConfig = (options: Schema) => (tree: Tree, context: SchematicContext) => {
  context.logger.info('Added husky configuration');

  const packageJson = getPackageJson(tree);

  const huskyConfig = {
    hooks: {
      'commit-msg': 'commitlint -E HUSKY_GIT_PARAMS',
    },
  };
  if (options.force) {
    packageJson.husky = { ...packageJson.husky, ...huskyConfig }; // override
  } else {
    packageJson.husky = { ...huskyConfig, ...packageJson.husky }; // keep existing
  }

  overwritePackageJson(tree, packageJson);
};

const addCommitizenConfig = (options: Schema) => (tree: Tree, context: SchematicContext) => {
  context.logger.info('Added commitizen configuration');

  const packageJson = getPackageJson(tree);

  const commitizenConfig = {
    commitizen: {
      path: './node_modules/cz-conventional-changelog',
    },
  };
  if (options.force) {
    packageJson.config = { ...packageJson.config, ...commitizenConfig }; // override
  } else {
    packageJson.config = { ...commitizenConfig, ...packageJson.config }; // keep existing
  }

  overwritePackageJson(tree, packageJson);
};

const standardVersionConfig = (options: Schema) => (tree: Tree, context: SchematicContext) => {
  context.logger.info('Added standard-version config');
  const packageJson = getPackageJson(tree);

  const scriptsToAdd = {
    issuePrefixes: [options.issuePrefix || ''],
  };
  if (options.force) {
    packageJson['standard-version'] = {
      ...packageJson['standard-version'],
      ...scriptsToAdd,
    }; // override
  } else {
    packageJson['standard-version'] = {
      ...scriptsToAdd,
      ...packageJson['standard-version'],
    }; // keep existing
  }

  overwritePackageJson(tree, packageJson);
};

const addCommitlintConfigFile = (options: Schema) => (tree: Tree, context: SchematicContext) => {
  context.logger.info('Added commitlint configuration file');
  const sourceTemplates = url('./files');
  const sourceParameterizedTemplates = apply(sourceTemplates, [
    template({
      issuePrefix: options.issuePrefix || '',
    }),
    forEach((fileEntry: FileEntry) => {
      // override existing files if force flag has been set
      if (options.force && tree.exists(fileEntry.path)) {
        tree.overwrite(fileEntry.path, fileEntry.content);
        return null;
      }
      return fileEntry;
    }),
  ]);
  return mergeWith(sourceParameterizedTemplates)(tree, context);
};

const installDependencies = () => (_tree: Tree, context: SchematicContext) => {
  context.logger.info('Installs npm dependencies');
  context.addTask(new NodePackageInstallTask());
};
