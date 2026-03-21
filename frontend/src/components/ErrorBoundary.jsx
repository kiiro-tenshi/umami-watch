import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center bg-red-50 border border-red-200 rounded-xl max-w-lg mx-auto mt-10">
          <h2 className="text-2xl font-bold text-red-700 mb-2">Something went wrong</h2>
          <p className="text-red-500 mb-4">{this.state.error?.message || 'An unexpected error occurred.'}</p>
          <button onClick={() => window.location.reload()} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg">
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
export default ErrorBoundary;
