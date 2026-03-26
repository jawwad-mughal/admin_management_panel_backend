import mongoose from 'mongoose';
import { User } from './src/models/User';
import BranchModel from './src/models/branch';
import * as dotenv from 'dotenv';

dotenv.config();

async function assignBranchesToAllUsers(): Promise<void> {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/management_system';

    await mongoose.connect(mongoUri);
    console.log('✅ Database connected');

    // Get all branches
    const branches = await BranchModel.find({ status: 'Active' });

    if (branches.length === 0) {
      console.log('❌ No active branches found. Please create branches first.');
      await mongoose.connection.close();
      return;
    }

    const defaultBranch = branches[0];
    console.log(`🏢 Using default branch: ${defaultBranch.name}`);

    // Find users without branch
    const usersWithoutBranch = await User.find({
      $or: [
        { branch: null },
        { branch: undefined },
        { branch: '' }
      ]
    });

    console.log(`👥 Found ${usersWithoutBranch.length} users without branch`);

    if (usersWithoutBranch.length === 0) {
      console.log('✅ All users already have branches assigned!');
      await mongoose.connection.close();
      return;
    }

    // Update all users without branch
    const result = await User.updateMany(
      {
        $or: [
          { branch: null },
          { branch: undefined },
          { branch: '' }
        ]
      },
      { branch: defaultBranch._id }
    );

    console.log(`✅ Updated ${result.modifiedCount} users with branch: ${defaultBranch.name}`);

    // Show updated users
    const updated = await User.find({ branch: defaultBranch._id }).select('name email role branch');
    console.log('\n📝 Users in this branch:');
    updated.forEach((user: any) => {
      console.log(`  - ${user.name} (${user.email}) - ${user.role}`);
    });

    console.log('\n✅ Branch assignment complete!');
    await mongoose.connection.close();
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
}

assignBranchesToAllUsers();