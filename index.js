require('dotenv').config()
const request = require("request");
const Influxdb = require('influxdb-v2');
const os = require('os');
const package = require('./package.json');

const customHeaderRequest = request.defaults({
    headers: { 'User-Agent': `VAGRAD-Stats/${package.version} (NodeJS_${process.env.NODE_VERSION}) ${os.platform()} (${os.arch()})` }
})

/* Create InfluxClient */
const db = new Influxdb({
    host: process.env.Influx_Host,
    protocol: process.env.Influx_Protocol,
    port: process.env.Influx_Port,
    token: process.env.Influx_Token
});

/**
 * Gets current stats from Nextbike API
 * @param {String} [url]
 * @returns {BikesData}
 */
const getBikesData = (url = process.env.URL) => {
    return new Promise(function (resolve, reject) {
        customHeaderRequest(url, { json: true }, (error, response, body) => {
            if (error) {
                reject(error);
            } else {
                resolve(body);
            }
        });
    });
}

/**
 * Savs a Datapoint to InfluxDB
 * @param {String} key 
 * @param {*} value 
 */
const writeDatapoint = async (key, value) => {
    await db.write(
        {
            precision: 's',
            bucket: process.env.Database_Bucket,
            org: process.env.Database_Orga
        }, [{
            measurement: key,
            tags: { host: process.env.TagsName },
            fields: value
        }]
    )
}

/**
 * Stores a Object to InfluxDB
 */
const ProcessData = async () => {
    try {
        const BikesData = await getBikesData();

        let bike_types = [];
        let bike_types_amount = [];

        let out_object = {
            bikes_available: 0,
            free_racks: 0,
            free_special_racks: 0,
        };

        BikesData.countries[0].cities[0].places.map(place => {
            //Get all bikey available
            out_object.bikes_available = out_object.bikes_available + place.bikes_available_to_rent
            //Get all free racks
            out_object.free_racks = out_object.free_racks + place.free_racks
            //Get all free special racks
            out_object.free_special_racks = out_object.free_special_racks + place.free_special_racks

            //Get all bike types
            for (const [key, value] of Object.entries(place.bike_types)) {
                if (bike_types.indexOf(key) === -1) {
                    bike_types.push(key);
                }
            }

            //Create new Array with all bike types as object
            bike_types_amount.push(place.bike_types);
        });

        //Count all bike amounts based on type (This is written dynamicly in case other types are added)
        //Performance is poor
        let bikes_type_count = {};
        bike_types.map(bike_type => {
            let amount = 0;
            bike_types_amount.map(bike_type_amount => {
                for (const [key, value] of Object.entries(bike_type_amount)) {
                    if (key === bike_type) {
                        amount = amount + value;
                    }
                }
            });
            bikes_type_count[bike_type] = amount;
        });

        //Object of Objects that are written as messurement to InfluxDB
        const to_influx = {
            Bikes: {
                BikesAvailable: out_object.bikes_available,
            },
            Racks: {
                Free: out_object.free_racks,
                FreeSpecial: out_object.free_special_racks,
            },
            BikeTypes: bikes_type_count
        }

        for (const [key, value] of Object.entries(to_influx)) {
            writeDatapoint(key, value);
        }

    } catch (e) {
        console.log(e)
    }
}

ProcessData();
setInterval(ProcessData, process.env.CheckDelayInMinutes*1000*60);