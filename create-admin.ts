import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from './src/models/User';
import * as dotenv from 'dotenv';

dotenv.config();

async function createAdmin(): Promise<void> {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/management_system';

    await mongoose.connect(mongoUri);
    console.log('✅ Database connected');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin@test.com' });
    if (existingAdmin) {
      console.log('⚠️  Admin already exists with email: admin@test.com');
      await mongoose.connection.close();
      return;
    }

    const hashedPassword = await bcrypt.hash('admin123', 10);

    const admin = await User.create({
      name: 'Admin User',
      email: 'admin@test.com',
      password: hashedPassword,
      phone: '1234567890',
      role: 'Admin',
      permissions: ['admin:full_access']
    });

    console.log('✅ Admin user created successfully!');
    console.log('📧 Email: admin@test.com');
    console.log('🔑 Password: admin123');
    console.log('👤 Role: Admin');
    console.log('🔐 Permissions: admin:full_access');
    console.log('ID:', admin._id);

    await mongoose.connection.close();
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
};

createAdmin();


