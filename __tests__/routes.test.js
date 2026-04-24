const express = require('express');
const request = require('supertest');
const session = require('express-session');

jest.mock('../models/users', () => {
  const saveMock = jest.fn();

  function UserModel(data) {
    Object.assign(this, data);
    this.save = saveMock;
  }

  UserModel.find = jest.fn();
  UserModel.countDocuments = jest.fn();
  UserModel.findById = jest.fn();
  UserModel.findByIdAndUpdate = jest.fn();
  UserModel.findByIdAndDelete = jest.fn();
  UserModel._saveMock = saveMock;

  return UserModel;
});

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  unlinkSync: jest.fn(),
}));

const User = require('../models/users');
const fs = require('fs');

function createApp() {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(
    session({ secret: 'test-secret', saveUninitialized: true, resave: false })
  );
  app.set('view engine', 'ejs');

  app.use((req, res, next) => {
    res.render = jest.fn((view, data) => {
      res.json({ view, data });
    });
    next();
  });

  app.use('', require('../routes/routes'));
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET / - Fetch users', () => {
  test('returns the home page with a list of users', async () => {
    const fakeUsers = [
      { name: 'Alice', email: 'alice@example.com', phone: '1234567890' },
      { name: 'Bob', email: 'bob@example.com', phone: '0987654321' },
    ];

    const chainable = {
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      sort: jest.fn().mockResolvedValue(fakeUsers),
    };
    User.find.mockReturnValue(chainable);
    User.countDocuments.mockResolvedValue(2);

    const app = createApp();
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body.view).toBe('index');
    expect(res.body.data.users).toEqual(fakeUsers);
    expect(res.body.data.totalPages).toBe(1);
    expect(User.find).toHaveBeenCalled();
  });

  test('returns an error message when the database query fails', async () => {
    const chainable = {
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      sort: jest.fn().mockRejectedValue(new Error('DB connection lost')),
    };
    User.find.mockReturnValue(chainable);

    const app = createApp();
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('DB connection lost');
  });
});

describe('POST /add - Insert a new user', () => {
  test('creates a user successfully and redirects to /', async () => {
    User._saveMock.mockResolvedValue();

    const app = createApp();
    const res = await request(app)
      .post('/add')
      .field('name', 'Charlie')
      .field('email', 'charlie@example.com')
      .field('phone', '5551234567');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
    expect(User._saveMock).toHaveBeenCalled();
  });

  test('handles a database save error and still redirects', async () => {
    User._saveMock.mockRejectedValue(new Error('Duplicate key'));

    const app = createApp();
    const res = await request(app)
      .post('/add')
      .field('name', 'Charlie')
      .field('email', 'charlie@example.com')
      .field('phone', '5551234567');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });

  test('handles missing form fields gracefully', async () => {
    User._saveMock.mockRejectedValue(new Error('Validation failed'));

    const app = createApp();
    const res = await request(app).post('/add').field('name', '');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });
});

describe('GET /edit/:id - Edit user page', () => {
  test('renders the edit page when the user exists', async () => {
    const fakeUser = {
      _id: '664a1f1f1f1f1f1f1f1f1f1f',
      name: 'Alice',
      email: 'alice@example.com',
      phone: '1234567890',
      image: 'alice.png',
    };
    User.findById.mockResolvedValue(fakeUser);

    const app = createApp();
    const res = await request(app).get('/edit/664a1f1f1f1f1f1f1f1f1f1f');

    expect(res.status).toBe(200);
    expect(res.body.view).toBe('edit_user');
    expect(res.body.data.user).toEqual(fakeUser);
  });

  test('redirects to / when the user is not found', async () => {
    User.findById.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/edit/664a1f1f1f1f1f1f1f1f1f1f');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });
});

describe('POST /update/:id - Update user', () => {
  test('updates a user successfully and redirects to /', async () => {
    User.findByIdAndUpdate.mockResolvedValue({
      _id: '664a1f1f1f1f1f1f1f1f1f1f',
      name: 'Alice Updated',
      email: 'alice@example.com',
      phone: '1234567890',
      image: 'alice.png',
    });

    const app = createApp();
    const res = await request(app)
      .post('/update/664a1f1f1f1f1f1f1f1f1f1f')
      .field('name', 'Alice Updated')
      .field('email', 'alice@example.com')
      .field('phone', '1234567890')
      .field('old_image', 'alice.png');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      '664a1f1f1f1f1f1f1f1f1f1f',
      expect.objectContaining({ name: 'Alice Updated' }),
      { new: true }
    );
  });

  test('handles an update error and still redirects', async () => {
    User.findByIdAndUpdate.mockRejectedValue(new Error('Update failed'));

    const app = createApp();
    const res = await request(app)
      .post('/update/664a1f1f1f1f1f1f1f1f1f1f')
      .field('name', 'Alice')
      .field('email', 'alice@example.com')
      .field('phone', '1234567890')
      .field('old_image', 'alice.png');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });
});

describe('GET /delete/:id - Delete user', () => {
  test('deletes a user and redirects to /', async () => {
    User.findByIdAndDelete.mockResolvedValue({
      _id: '664a1f1f1f1f1f1f1f1f1f1f',
      name: 'Alice',
      image: 'alice.png',
    });

    const app = createApp();
    const res = await request(app).get('/delete/664a1f1f1f1f1f1f1f1f1f1f');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
    expect(User.findByIdAndDelete).toHaveBeenCalledWith('664a1f1f1f1f1f1f1f1f1f1f');
    expect(fs.unlinkSync).toHaveBeenCalledWith('./uploads/alice.png');
  });

  test('redirects even when user is not found', async () => {
    User.findByIdAndDelete.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/delete/nonexistent');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });

  test('handles deletion error gracefully', async () => {
    User.findByIdAndDelete.mockRejectedValue(new Error('Delete failed'));

    const app = createApp();
    const res = await request(app).get('/delete/664a1f1f1f1f1f1f1f1f1f1f');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });
});

describe('Static page routes', () => {
  test('GET /contact renders the contact page', async () => {
    const app = createApp();
    const res = await request(app).get('/contact');

    expect(res.status).toBe(200);
    expect(res.body.view).toBe('contact');
  });

  test('GET /about renders the about page', async () => {
    const app = createApp();
    const res = await request(app).get('/about');

    expect(res.status).toBe(200);
    expect(res.body.view).toBe('about');
  });

  test('GET /add renders the add users page', async () => {
    const app = createApp();
    const res = await request(app).get('/add');

    expect(res.status).toBe(200);
    expect(res.body.view).toBe('add_users');
  });
});
