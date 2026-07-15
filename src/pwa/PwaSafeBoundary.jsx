import { Component } from 'react';

/**
 * Isolates PWA install UI failures so they never blank the ERP.
 */
export default class PwaSafeBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    /* swallow — install UI is optional */
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
