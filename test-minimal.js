// test-minimal.js
console.log('🧪 Testing minimal form-autofill...\n');

const formAutoFiller = require('./form-autofill');

console.log('✅ Module loaded');
console.log('   Type:', typeof formAutoFiller);
console.log('   autoSubmitForm:', typeof formAutoFiller.autoSubmitForm);
console.log('   closeBrowser:', typeof formAutoFiller.closeBrowser);

// Test method call
if (typeof formAutoFiller.autoSubmitForm === 'function') {
    console.log('\n✅ Method exists - module working!');
} else {
    console.log('\n❌ Method missing - module broken!');
    console.log('Available keys:', Object.keys(formAutoFiller));
}