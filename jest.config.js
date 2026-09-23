module.exports = {
  preset: '@react-native/jest-preset',
  // The Edge Functions under supabase/ are Deno code with their own test runner
  // (`npm run test:functions`); jest only owns the app.
  roots: ['<rootDir>/src'],
};
