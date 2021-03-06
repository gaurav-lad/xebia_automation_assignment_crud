'use strict';

var fs = require('fs-plus'),
    path = require('path'),
    requireDir = require('require-dir'),
    merge = require('merge'),
    chalk = require('chalk'),
    selenium = require('selenium-webdriver'),
    proxy = require('selenium-webdriver/proxy'),
    chromedriver = require('chromedriver'),
    iedriver = require('iedriver'),
    firefox = require('geckodriver'),
    expect = require('chai').expect,
    assert = require('chai').assert,
    reporter = require('../htmlReporter/index');
var findRemoveSync = require('find-remove');

global.DEFAULT_TIMEOUT = 180 * 1000;

function getDriverInstance() {
    switch (browserName || '') {

        case 'firefox': {

            driver = new selenium.Builder().withCapabilities({
                browserName: 'firefox',
                javascriptEnabled: true,
                acceptSslCerts: true,
                'webdriver.firefox.bin': firefox.path
            }).build();

        } break;

        // default to chrome
        default: {
            //console.log('in default');
            driver = new selenium.Builder().withCapabilities({
                browserName: 'chrome',
                javascriptEnabled: true,
                acceptSslCerts: true,
                chromeOptions: {
                    "args": ["start-maximized"]
                },
                path: chromedriver.path
            }).build();
        }

    };

    return driver;
}

function consoleInfo() {
    var args = [].slice.call(arguments),
        output = chalk.bgBlue.white('\n>>>>> \n' + args + '\n<<<<<\n');

    console.log(output);
}

function World() {

    // create a list of variables to expose globally and therefore accessible within each step definition
    var runtime = {
        driver: null,           // the browser object
        selenium: selenium,     // the raw nodejs selenium driver
        By: selenium.By,        // in keeping with Java expose selenium By 
        by: selenium.By,        // provide a javascript lowercase version
        until: selenium.until,  // provide easy access to selenium until methods
        expect: expect,         // expose chai expect to allow variable testing
        assert: assert,         // expose chai assert to allow variable testing
        trace: consoleInfo,     // expose an info method to log output to the console in a readable/visible format
        page: {},               // empty page objects placeholder
        shared: {}              // empty shared objects placeholder
    };

    // expose properties to step definition methods via global variables
    Object.keys(runtime).forEach(function (key) {

        // make property/method avaiable as a global (no this. prefix required)
        global[key] = runtime[key];
    });

    // import page objects (after global vars have been created)
    if (global.pageObjectPath && fs.existsSync(global.pageObjectPath)) {

        // require all page objects using camelcase as object names
        runtime.page = requireDir(global.pageObjectPath, { camelcase: true });

        // expose globally
        global.page = runtime.page;
    };

    // import shared objects from multiple paths (after global vars have been created)
    if (global.sharedObjectPaths && Array.isArray(global.sharedObjectPaths) && global.sharedObjectPaths.length > 0) {

        var allDirs = {};

        // first require directories into objects by directory
        global.sharedObjectPaths.forEach(function (itemPath) {

            if (fs.existsSync(itemPath)) {

                var dir = requireDir(itemPath, { camelcase: true });

                merge(allDirs, dir);
            }
        });

        // if we managed to import some directories, expose them
        if (Object.keys(allDirs).length > 0) {

            // expose globally
            global.shared = allDirs;
        }
    };

    // add helpers
    global.helpers = require('../runtime/helpers.js');
}

// export the "World" required by cucubmer to allow it to expose methods within step def's
module.exports = function () {
    this.World = World;
    this.setDefaultTimeout(DEFAULT_TIMEOUT);
    this.registerHandler('BeforeScenario', function (scenario) {
        if (!global.driver) {
            global.driver = getDriverInstance();
        }
        // driver.manage().window().maximize();
    });
    this.registerHandler('AfterFeatures', function (features, done) {
        if (global.defRep != 'no') {
            if (global.reportsPath && fs.existsSync(global.reportsPath)) {
                var reportOptions = {
                    theme: 'bootstrap',
                    jsonFile: path.resolve(global.reportsPath, global.JsonRepoName),
                    output: path.resolve(global.reportsPath, 'cucumber-report.html'),
                    reportSuiteAsScenarios: true,
                    launchReport: true,
                    ignoreBadJsonFile: true
                };
                reporter.generate(reportOptions);
            }
        }
        if (global.repoClr == 'clr') {
            var remResult = findRemoveSync(global.reportsPath, { extensions: ['.json'] });
        }
        done();
    });

    this.After(function (scenario) {
        if (scenario.isFailed()) {
            return driver.takeScreenshot().then(function (screenShot) {
                scenario.attach(new Buffer(screenShot, 'base64'), 'image/png');
                return driver.close().then(function () {
                    return driver.quit();
                });
            });
        }
        else {
            return driver.close().then(function () {
                return driver.quit();
            });
        }
    });
};