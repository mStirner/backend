module.exports = (scope) => {
    scope._ready(({ logger }) => {

        // proceed mdns item instance
        // deconstruct properties
        let matchCallbacks = scope.items.map(({ name, type, _matches }) => {
            return {
                name,
                type,
                _matches
            };
        });


        // listen for newly added items
        scope.events.on("added", ({ name, type, _matches }) => {
            matchCallbacks.push({
                name,
                type,
                _matches
            });
        });


        scope.events.on("message", (packet, message) => {

            // feedback
            logger.trace("Message received on udp socket, record:", packet, "message: ", message);

            if (packet.type === "response") {
                packet.answers.forEach((record) => {
                    matchCallbacks.forEach(async ({ name, type, _matches }, i) => {

                        // create regex from db data
                        // allow wildcards writen as * in items
                        name = name.replace(/\./, "\\.");
                        name = name.replace("*", ".*");
                        let rexp = new RegExp(name);

                        if (type === record.type && rexp.test(record.name)) {

                            logger.verbose("Matching recourd found", record, name, type);

                            let { timestamps, _id } = scope.items[i];
                            timestamps.announced = Date.now();

                            // update mdns item timestamps
                            await scope.update(_id, {
                                timestamps: {
                                    ...timestamps
                                }
                            });

                            _matches.forEach((cb) => {
                                cb(record);
                            });

                        } else {

                            // Do nothing if nothing matches
                            //console.log(">> NON << MAchting record type");

                        }

                    });
                });
            } else {

                logger.trace("Other packet type then response received", packet.type);

            }

        });

    });
};