window.WFG_LA_PRESET_SNAPSHOTS = window.WFG_LA_PRESET_SNAPSHOTS || {};
window.WFG_LA_PRESET_SNAPSHOTS["i2c-measure"] = {
  "version": 1,
  "sampleRateHz": 200000000,
  "totalSamples": 1414814312,
  "triggerSample": 40000202,
  "channelCount": 16,
  "settings": {
    "model": "LA2016",
    "sampleRateHz": 200000000,
    "sampleDepthSamples": 2000000000,
    "enabledChannels": [
      0,
      1
    ],
    "trigger": {
      "enabled": true,
      "channel": 0,
      "edge": "falling",
      "positionPercent": 2
    },
    "thresholdV": 0.9
  },
  "analyzers": [
    {
      "type": "i2c",
      "config": {
        "sda": 0,
        "scl": 1,
        "addressDisplay": "7bit",
        "exportLevel": "packets",
        "memoryAddress": "lowbits",
        "kvFileName": "I2C.dll",
        "kvFormat": "2",
        "kvParams": "I2CAnalyzer,0,0,1,0,0,0,"
      }
    }
  ],
  "channelNames": [
    "SDA",
    "SCL",
    "I2C_SCL",
    "SCL",
    "CH4",
    "CH5",
    "CH6",
    "AUXOUT",
    "CH8",
    "CH9",
    "CH10",
    "CH11",
    "CH12",
    "CH13",
    "CH14",
    "CH15"
  ],
  "channelColors": [
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    ""
  ],
  "channels": [
    {
      "index": 0,
      "name": "SDA",
      "color": "",
      "initialLevel": 1,
      "edgeCount": 69,
      "edgeDeltasB64": "yrWJE9YDkwTGBJIE3BjmGOAlriLgJa0B5wLX4wnXA5IExgSSBPcV7hnmAq/zA9cDkgTHBJEE9xXcGucC7O8D1wOSBMYEkgT3Fd0a5gKv8wPWA5MExgSSBPYV7hnmAom8CNUDlATEBJQEyhHJAuE+uiK1BaZFtAXNQ7QFzEOzBc1DtAW1NLQF5jrNJs0r5QKVzKGPBQ=="
    },
    {
      "index": 1,
      "name": "SCL",
      "color": "",
      "initialLevel": 1,
      "edgeCount": 301,
      "edgeDeltasB64": "qLeJE+UCxwHlAscB5QLHAeYCxgHmAsYB5gLGAeYCxgHmAsYB5gLGAaEaxQHnAsUB5gLGAeYCxgHnAsUB5wLFAecCxQHmAsYB5wLFAekjxQHmAsYB5gLGAeYCxwHmAsYB5QLHAeYCxgHmAsYB5gLGAeYClecJ5QLHAeYCxgHlAscB5gLGAeYCxgHmAsYB5gLHAeUCxwHlAscBwhjs9gPlAscB5wLFAeYCxgHnAsUB5gLGAeYCxgHmAsYB5gLGAeYCxgGyGanzA+QCyAHmAsYB5gLGAeYCxgHmAsYB5gLHAeYCxgHlAscB5QLHAbEZ7PYD5ALIAeYCxgHlAscB5QLHAeUCxwHlAscB5QLHAeUCxwHlAscBwhjGvwjkAsgB5ALIAeMCyQHkAsgB5ALHAeUCyAHlAscB5QLHAeUCxgGfGsgB5ALIAeQCyAHlAscB5gLGAeUCxwHlAscB5QLHAfMjxQHUA8gB5ALIAeQCyAHkAsgB5ALIAeQCxwHkAsgB5QLHAcUlxwHTA8kB5ALHAeYCxwHmAsYB5gLGAeQCyAHkAsgB5ALIAesjxgHTA8gB5ALIAeQCyAHkAsgB5ALIAeMCyQHkAsgB5ALIAeojxwHTA8gB5ALIAeUCxwHmAsYB5QLHAeQCyAHkAsgB5ALIAesjxgHTA8gB5ALIAeQCyAHkAsgB5ALIAeQCyAHkAsgB5ALIAdMUxwHUA8gB5ALIAeQCyAHkAsgB5ALIAeUCxwHmAsYB5QLHAYIbyAHUA8cB5QLHAeUCxwHmAsYB5QLHAeQCyAHkAsgB5ALIAdgoxwHlAvTNoY8F"
    }
  ]
};
