import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './desktop.css';
import './redesign.css';
import './components/ui/floating-popover.css';
import './components/ui/select.css';
import './components/ui/calendar.css';
import './form-controls.css';
import './update-067.css';
import App from './App';
import { DesktopTitlebar } from './DesktopChrome';
import { installScrollbarActivity } from './scrollbars';

const removeScrollbarActivity = installScrollbarActivity();
import.meta.hot?.dispose(removeScrollbarActivity);

createRoot(document.getElementById('root')!).render(<React.StrictMode><DesktopTitlebar/><App /></React.StrictMode>);
