import '@testing-library/jest-dom'

// Silence MapLibre GL JS warnings in test environment
globalThis.URL.createObjectURL = () => ''
globalThis.URL.revokeObjectURL = () => {}
