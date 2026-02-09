import express from 'express';
import bodyParser from 'body-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(bodyParser.json());

app.get('/', (req: express.Request, res: express.Response) => {
    res.send('Welcome to the n8n AI Manager!');
});

// Add additional routes and middleware as needed

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});