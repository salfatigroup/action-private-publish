const fs = require("fs")
const path = require("path")
const glob = require("glob")
const core = require("@actions/core")
const { exec, execSync } = require('child_process')

/**
 * Load all the inputs from the core actions inputs
 */
module.exports.getInputs = () => {
	const inputs = {
		token: process.env.NODE_AUTH_TOKEN,
		scope: core.getInput("scope"),
		scanGlob: (core.getInput('scan', { required: false }) || './').split(',').map(dir => path.join(process.env.GITHUB_WORKSPACE, dir.trim(), '/**/package.json')),
		ignoreList: core.getInput('ignore', { required: false }).trim().split(','),
		registry: core.getInput('registry', { required: false }) || "https://npm.pkg.github.com",
		tag: core.getInput('tag', { required: false }),
	}

	// log
	console.log(`Directories to scan: ${inputs.scanGlob.join('\n\t-')}\n`)
	console.log(`Ignore list: ${inputs.ignoreList.join('\n\t-')}\n`)

	return inputs
}

/**
 * Scan the packages according to the provided glob
 * and ignored packages
 */
module.exports.scanPackages = async (scanGlob, ignoreList = []) => {
	const globPromises = scanGlob.map(globPattern => {
		return new Promise((resolve, reject) => {
			glob(
				globPattern,
				{
					ignore: [
						...ignoreList,
						'**/node_modules/**',
					]
				},
				(err, files) => {
					if (err) {
						reject(err)
					} else {
						resolve(files)
					}
				}
			)
		})
	})

	const matchedFiles = await Promise.all(globPromises)
	return matchedFiles.flat()
}

/**
 * Publish packages to NPM
 */
module.exports.publish = (packages, registry, scope, token, tag) => {
	_ensureGlobalNpmrc(registry, token)
	_ensurePackageNpmrc(`${process.env.GITHUB_WORKSPACE}/package.json`, scope, registry)

	const publishPromises = packages.map(packagePath => {
		// ensure npmrc
		_ensurePackageNpmrc(packagePath, scope, registry)

		// skip private packages
		if (_isPrivatePackage(packagePath)) {
			console.log(`\tSkipping private package: ${packagePath}`)
			return
		}

		// publish package
		return _publishPackage(packagePath, tag)
	})

	return Promise.all(publishPromises)
}

/**
 * Check if package is private
 */
function _isPrivatePackage(packagePath) {
	const packageJson = require(packagePath)
	return packageJson.private
}

/**
 * Ensures that the global npmrc file exists
 */
function _ensureGlobalNpmrc(register, token) {
	// get the package dir
	const npmrcPath = path.join(process.env.HOME, '.npmrc')
	if (!fs.existsSync(npmrcPath)) {
		fs.writeFileSync(npmrcPath, `//${register}:_authToken=${token}\nalways-auth=true`)
	}
}

/**
 * Ensures that the npmrc file exists
 */
function _ensurePackageNpmrc(packagePath, scope, registry) {
	// get the package dir
	const packageDir = path.dirname(packagePath)

	// create .npmrc file in the packagedir location
	const npmrcPath = path.join(packageDir, '.npmrc')
	if (!fs.existsSync(npmrcPath)) {
		fs.writeFileSync(npmrcPath, `${scope}:registry=https://${registry}`)
	}
}

/**
 * Publishes a single package to NPM
 */
function _publishPackage(packagePath, tag) {
	return new Promise((resolve, reject) => {
		const packageDir = path.dirname(packagePath)

		// update package version
		const packageVersionCmd = `npm version ${tag} --no-git-tag-version`
		execSync(packageVersionCmd, { cwd: packageDir })

		const cmd = `npm publish ${packageDir}`
		console.log(`\t${cmd}\n`)
		exec(cmd, (err, stdout, stderr) => {
			if (err) {
				reject(err)
			} else {
				resolve(packagePath)
			}
		})
	})
}
