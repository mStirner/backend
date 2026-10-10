const C_DEVICES = require("../components/devices");
const { PENDING_BRIDGES } = require("../components/devices/class.interface.js");

const CONNECTORS = new Set();
const { EventEmitter } = require("events");
const emitter = new EventEmitter();

// external modules
const WebSocket = require("ws");

module.exports = (router) => {

    // websocket server
    let wss = new WebSocket.Server({
        noServer: true
    });

    // detect broken connections
    let interval = setInterval(() => {
        wss.clients.forEach((ws) => {

            if (!ws.isAlive) {

                ws.terminate();

                if (ws.info) {
                    ws.info.connections = 0;
                    ws.info.timestamps.disconnected = Date.now();
                }

                return;

            }

            ws.isAlive = false;
            ws.ping();

        });
    }, Number(process.env.API_WEBSOCKET_TIMEOUT));


    // if the server closes
    // clear the interval
    wss.on("close", () => {
        clearInterval(interval);
    });


    wss.on("connection", (ws) => {
        if (PENDING_BRIDGES.size > 0 && ws.readyState === WebSocket.OPEN) {

            PENDING_BRIDGES.forEach((bridge) => {
                ws.send(JSON.stringify(bridge), () => {

                    // sometimes it happens that pending bridges are not build
                    // but message is written to the connector
                    //let { remotePort, remoteAddress } = req.socket;
                    //console.log(err || `Writed to connector [${remoteAddress}:${remotePort}]: ${JSON.stringify(bridge)}`);

                });
            });

        }
    });


    C_DEVICES.events.on("socket", (obj) => {
        if (obj.type === "request") {

            wss.clients.forEach((ws) => {
                // TODO: check if readyState = open
                //if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(obj));
                //}
            });

        }
    });


    // http route handler
    // TODO: Reformat to match router.api.mdns.js code style/if-else
    router.get("/", (req, res) => {

        // check if connection is a simple get request or ws client
        if ((!req.headers["upgrade"] || !req.headers["connection"])) {

            //return res.status(403).end();
            //next(); // let the rest-handler.js do its job
            return res.json(Array.from(CONNECTORS));

        }

        // handle request as websocket
        // perform websocket handshake 
        wss.handleUpgrade(req, req.socket, req.headers, (ws) => {

            ws.isAlive = true;

            ws.on("pong", () => {
                ws.isAlive = true;
            });

            ws.connectedAt = Date.now();
            ws.ip = req.ip || req.socket.remoteAddress;

            const applyInfo = (rawInfo) => {

                let obj = Array.from(CONNECTORS).find((about) => {
                    return about.hostname === rawInfo.hostname && about.ip === ws.ip;
                });

                // client cant override ip or timestamps
                // eslint-disable-next-line
                let { timestamps, ip, ...rest } = rawInfo;

                if (!obj) {
                    obj = {
                        version: null,
                        whitelist: [],
                        hostname: null,
                        interfaces: [],
                        connections: 0,
                        timestamps: {
                            connected: null,
                            updated: null,
                            disconnected: null
                        },
                        ip: ws.ip
                    };
                    CONNECTORS.add(obj);
                }

                Object.assign(obj, rest);

                obj.timestamps.connected = ws.connectedAt;
                obj.timestamps.updated = Date.now();

                ws.info = obj;
                emitter.emit("info", ws.info);

            };

            if (req.query?.info) {
                try {
                    let json = Buffer.from(req.query.info, "base64").toString("utf-8");
                    let data = JSON.parse(json);
                    applyInfo(data);
                } catch (e) {

                    console.error("Invalid legacy info query param", e);

                }
            }

            ws.on("message", (msg) => {
                try {

                    let json = Buffer.from(msg).toString("utf8");
                    let data = JSON.parse(json);

                    if (data?.event === "info") {
                        applyInfo(data.info);
                    }

                } catch (e) {

                    console.error(e);

                }
            });

            ws.once("close", () => {

                if (ws.info) {
                    ws.info.connections = 0;
                    ws.info.timestamps.disconnected = Date.now();
                }

                emitter.emit("info", ws.info);

            });

            wss.emit("connection", ws, req);

        });

    });

    router.get("/info", (req, res) => {

        req.socket.setTimeout(0);
        req.socket.setNoDelay(true);
        req.socket.setKeepAlive(true);

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");

        res.flushHeaders();

        res.write(`event: connected\ndata: []\n\n`);

        // keep socket open
        // otherwise tcp socket in proxy chain could be closed
        let heartbeat = setInterval(() => {
            res.write(`: heartbeat\n\n`);
        }, 15000);

        let onInfo = () => {
            const data = Array.from(CONNECTORS);
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        emitter.on("info", onInfo);

        ["error", "close"].forEach((event) => {
            req.on(event, () => {

                clearInterval(heartbeat);
                emitter.off("info", onInfo);

            });
        });

    });

    /*
    router.delete("/info", () => {

        CONNECTORS.clear();
        res.end();

    });
    */

};