import { Component, useState, useEffect } from 'react';

export default class ErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return (
      <div style={{display:'flex', height:'100vh', justifyContent:'center', alignItems:'center', backgroundColor:'#0a0a0a', color:'#00ffcc', flexDirection:'column'}}>
        <h1>Connection to Grid Backend Lost</h1>
        <p style={{color:'#888'}}>Attempting to reconnect...</p>
        <button onClick={() => window.location.reload()} style={{marginTop:'20px', padding:'10px', backgroundColor:'#333', color:'white', border:'none', cursor:'pointer'}}>Reconnect</button>
      </div>
    );
  }
}