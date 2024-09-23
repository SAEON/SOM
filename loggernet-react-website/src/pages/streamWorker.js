self.onmessage = async (event) => {
    const { url, fileName } = event.data;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            self.postMessage({ error: "Failed to fetch data" });
            return;
        }

        const reader = response.body.getReader();
        const fileStream = self.streamSaver.createWriteStream(fileName);
        const writer = fileStream.getWriter();

        const pump = () => {
            reader.read().then(({ done, value }) => {
                if (done) {
                    writer.close();
                    self.postMessage({ message: "Streaming completed" });
                    return;
                }

                writer.write(value);
                self.postMessage({ message: "Chunk received", size: value.length });
                pump();
            }).catch((error) => {
                self.postMessage({ error: `Stream error: ${error.message}` });
                writer.abort();
            });
        };

        pump();
    } catch (error) {
        self.postMessage({ error: `Error in worker: ${error.message}` });
    }
};
