
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' })
const fileUpload = require('express-fileupload'); // For handling file upload
const cloudinary = require('./cloudinary');
const app=express()
const path = require('path');


// app.use(fileUpload()); // Middleware to handle/ file uploads
app.use(cors());

app.use(fileUpload({
  useTempFiles: true,
  tempFileDir: path.join(__dirname, 'tmp'), // for Windows safety
}));

// const port = 5000;

// Middleware
app.use(express.json());  // For parsing JSON bodies

// In-memory task storage
let tasks = [
  {
    id: uuidv4(),
    title: 'Example Task A',
    description: 'This is a sample task in To Do',
    priority: 'Medium',
    category: 'Feature',
    status: 'todo',
  },
  {
    id: uuidv4(),
    title: 'Example Task B',
    description: 'This is in progress task',
    priority: 'High',
    category: 'Bug',
    status: 'in-progress',
  },
  {
    id: uuidv4(),
    title: 'Example Task C',
    description: 'Completed task example',
    priority: 'Low',
    category: 'Enhancement',
    status: 'done',
  },
];

// POST endpoint to create a new task
app.post('/api/tasks', (req, res) => {
  const { title, description, priority, category, status } = req.body;

  if (!title || !description) {
    return res.status(400).json({ message: 'Title and description are required' });
  }

  const newTask = {
    id: uuidv4(),
    title,
    description,
    priority,
    category,
    status,
    attachment: null, // will be added later if file is uploaded
  };

  tasks.push(newTask);
  res.status(200).json(newTask);
})


app.post('/api/tasks/upload/:taskId', async (req, res) => {
  const taskId = req.params.taskId;
  const file = req.files?.file;

  if (!file || !file.tempFilePath) {
    return res.status(400).json({ message: 'No file uploaded or file path missing' });
  }

  try {
    // Normalize path to support Windows
    const normalizedPath = path.resolve(file.tempFilePath);
    console.log('Normalized file path:', normalizedPath);

    const result = await cloudinary.uploader.upload(normalizedPath, {
      folder: 'task_attachments',
    });

    const task = tasks.find(t => t.id === taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    task.attachment = result.secure_url;

    res.status(200).json({ message: 'File uploaded successfully', task });
  } catch (err) {
    console.error('Cloudinary upload error:', err);
    res.status(500).json({ message: 'Upload failed', error: err.message });
  }
});


// PUT endpoint to update an existing task
app.put('/api/tasks/:id', (req, res) => {
  const taskId = req.params.id;
  const updatedTaskData = req.body;

  // Find the task by ID and update it
  let taskFound = false;
  tasks = tasks.map(task => {
    if (task.id === taskId) {
      taskFound = true;
      return { ...task, ...updatedTaskData };  // Merge existing task with the new data
    }
    return task;
  });

  if (taskFound) {
    console.log('Task updated:', updatedTaskData);
    res.status(200).json(updatedTaskData);  // Send back the updated task
  } else {
    res.status(404).json({ message: 'Task not found' });
  }
});

// DELETE endpoint to delete a task by ID
app.delete('/api/tasks/:id', (req, res) => {
  const taskId = req.params.id;

  // Filter out the task from the array
  const initialLength = tasks.length;
  tasks = tasks.filter(task => task.id !== taskId);

  if (tasks.length < initialLength) {
    console.log(`Task with ID ${taskId} deleted`);
    res.status(200).json({ message: 'Task deleted successfully' });
  } else {
    res.status(404).json({ message: 'Task not found' });
  }
});

// Fetch all tasks (you can use this in the frontend to sync tasks)
app.get('/api/tasks', (req, res) => {
  console.log("Task data sent:", tasks);
  res.status(200).json(tasks);
});

// Create the HTTP server
const server = http.createServer(app);

// Set up the WebSocket server
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// WebSocket connection handler
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Sync tasks on new connection
  socket.on('sync:tasks', () => {
    socket.emit('sync:tasks', tasks);
  });

  // Create a task (WebSocket)
  socket.on('task:create', (taskData) => {
    const newTask = { ...taskData, id: uuidv4() };
    tasks.push(newTask);
    io.emit('task:create', newTask);
  });

  // Update a task (WebSocket)
  socket.on('task:update', (updatedTask) => {
    tasks = tasks.map(task => task.id === updatedTask.id ? updatedTask : task);
    io.emit('task:update', updatedTask);
  });

  // Move a task between columns (WebSocket)
  socket.on('task:move', ({ id, newStatus }) => {
    const task = tasks.find(t => t.id === id);
    if (task) {
      task.status = newStatus;
      io.emit('task:move', { id, newStatus });
    }
  });

  // Delete a task (WebSocket)
  socket.on('task:delete', (id) => {
    tasks = tasks.filter(task => task.id !== id);
    io.emit('task:delete', id);
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Start the server
server.listen(process.env.PORT, () => {
  console.log(`Server running at http://localhost:${port}`);
});
