const Papa = require("papaparse");
const unmarshal = require("dynamodb-marshaler").unmarshal;

class DynamoCSVExporter {

  constructor(tableName, dynamoClient) {
    this.dynamoClient = dynamoClient;
    this.headersCaptured = false;
    this.headers = [];
    this.query = {
      TableName: tableName,
      Limit: 1000
    };
  }

  unMarshalIntoArray = (items) => {
    var unMarshalledArray = [];
    if (items.length === 0) return;

    // Generate headers
    items.forEach((row) => {
      let newRow = {};

      Object.keys(row).forEach((key) => {
        if (this.headers.indexOf(key.trim()) === -1) {
          this.headers.push(key.trim());
        }
        let newValue = unmarshal(row[key]);

        if (typeof newValue === "object") {
          newRow[key] = JSON.stringify(newValue);
        } else {
          newRow[key] = newValue;
        }
      });

      unMarshalledArray.push(newRow);
    });

    // convert data into CSV format
    var endData = Papa.unparse({
      fields: [...this.headers],
      data: unMarshalledArray
    });

    // remove column names after first write chunk.
    if (this.headersCaptured) {
      endData = endData.replace(/(.*\r\n)/, "\n");;
    } else {
      this.headersCaptured = true;
    }

    return endData;
  }

  exportAsCSV = async () => {
    var response = "";

    while (true) {

      // retrieve document data in raw format
      const data = await this.dynamoClient.scan(this.query).promise();

      // parse raw format into CSV format, append to a massive string
      response += this.unMarshalIntoArray(data.Items);

      // LastEvaluatedKey will only be present on a response if there is more to come
      if (!data.LastEvaluatedKey) {
        break;
      }

      // ExclusiveStartKey is like a checkpointer in a stream
      this.query.ExclusiveStartKey = data.LastEvaluatedKey;
    }
    return response;
  }

}

const exportTable = (tableName, dynamodb) => {
  const exporter = new DynamoCSVExporter(tableName, dynamodb)
  return exporter.exportAsCSV();
}

module.exports = { exportTable }
