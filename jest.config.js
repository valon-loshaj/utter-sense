const { jestConfig } = require("@salesforce/sfdx-lwc-jest/config");

module.exports = {
	...jestConfig,
	moduleNameMapper: {
		"^lightning/(.+)$": "<rootDir>/force-app/test/jest-mocks/lightning/$1"
	}
};
