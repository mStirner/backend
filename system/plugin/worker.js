const path = require("path");
const { workerData: { plugin }, isMainThread } = require("worker_threads");

// TODO: mute system messages e.g. db connection output
//process.env.LOG_SUPPRESS = "true";

// this enables colors
// https://github.com/debug-js/debug/issues/739#issuecomment-573442834
process.stdout.isTTY = true;
process.stderr.isTTY = true;


// init logger
// init database
// require plugin
// pass init functin & logger


const logger = require("../logger");
const log = logger.create(`plugins/${plugin.uuid}`);

const init_database = require("../init/init.database.js");
const init_components = require("../init/init.components.js");
const { init/*, Plugin*/ } = require("../../components/plugins/class.plugin.js");

(async () => {

    if (isMainThread) {
        throw new Error("Needs to be running in a worker thread");
    }

    await init_database(logger)();
    await init_components(logger)(plugin.intents);

    let folder = path.join(process.cwd(), "plugins", plugin.uuid);
    let entry = require(path.join(folder, "index.js"));
    let start = init(plugin, log);

    // new plugin entry point/function wrapper
    // should be in newer version userd
    // let returns = Plugin(entry);

    let returns = Reflect.apply(entry, null, [
        plugin,
        log,
        start
    ]);

    if (returns !== start) {
        console.log(new Error("Invalid init function returnd!"));
        process.exit(1);
    }

})();
