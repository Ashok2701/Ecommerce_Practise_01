/** English (base) dictionary. Add new locales by copying this shape into ./<code>.ts */
const en = {
  app: { tagline: 'B2B Commerce · ERP connected' },
  nav: {
    dashboard: 'Dashboard', users: 'Users', customers: 'Customers', myCustomers: 'My Customers', approvals: 'Approvals', orders: 'Orders', newOrder: 'New Order',
    catalog: 'Catalog', cart: 'Cart', invoices: 'Invoices', account: 'Account', announcements: 'Announcements', offers: 'Offers', messages: 'Messages',
    notifications: 'Notifications', assistant: 'AI Assistant', salesReps: 'Sales Team', followUps: 'Follow-ups', performance: 'Performance', settings: 'Settings',
    more: 'More', home: 'Home', support: 'Support',
    groups: { overview: 'Overview', commerce: 'Commerce', operations: 'Operations', engage: 'Engage', admin: 'Administration' },
  },
  roles: { admin: 'Administrator', manager: 'Supervisor / Manager', sales: 'Sales Representative', customer: 'B2B Customer' },
  common: {
    search: 'Search', searchPlaceholder: 'Search products, customers, orders…', all: 'All', status: 'Status', save: 'Save', cancel: 'Cancel', submit: 'Submit',
    view: 'View', edit: 'Edit', create: 'Create', approve: 'Approve', reject: 'Reject', back: 'Back', loading: 'Loading…', noResults: 'No results found',
    noResultsHint: 'Try adjusting your search or filters.', retry: 'Retry', error: 'Something went wrong', errorHint: 'We could not load this data. Please try again.',
    total: 'Total', subtotal: 'Subtotal', tax: 'GST (18%)', discount: 'Discount', quantity: 'Quantity', unitPrice: 'Unit price', actions: 'Actions',
    reply: 'Reply', send: 'Send', signOut: 'Sign out', profile: 'Profile', online: 'Online', offline: 'Offline', viewAll: 'View all', addToCart: 'Add to cart',
    markAllRead: 'Mark all as read', language: 'Language', simulateOffline: 'Simulate offline', resetDemo: 'Reset demo data', previous: 'Previous', next: 'Next',
    showing: 'Showing {from}–{to} of {total}', date: 'Date', amount: 'Amount', customer: 'Customer', clear: 'Clear', filters: 'Filters', close: 'Close',
  },
  status: {
    draft: 'Draft', pending_sync: 'Pending Sync', pending_approval: 'Pending Approval', changes_requested: 'Changes Requested', confirmed: 'Confirmed',
    processing: 'Processing', packed: 'Packed', dispatched: 'Dispatched', delivered: 'Delivered', cancelled: 'Cancelled', rejected: 'Rejected',
    paid: 'Paid', unpaid: 'Unpaid', partially_paid: 'Partially Paid', overdue: 'Overdue', active: 'Active', pending: 'Pending', inactive: 'Inactive', on_hold: 'On Hold',
    published: 'Published', scheduled: 'Scheduled', expired: 'Expired', open: 'Open', done: 'Done', in_stock: 'In stock', low_stock: 'Low stock', out_of_stock: 'Out of stock',
    planned: 'Planned', checked_in: 'Checked in', completed: 'Completed',
  },
  login: {
    title: 'Sign in to your account', subtitle: 'Orders, pricing, invoices and approvals – connected to your ERP.', email: 'Work email', password: 'Password',
    signIn: 'Sign in', demo: 'Demo accounts', demoHint: 'One-click sign in as any role (password: demo123)', forgot: 'Forgot password?',
  },
  dashboard: {
    admin: 'Platform overview', manager: 'Operations overview', sales: 'Good day, {name}', customer: 'Welcome back, {name}',
  },
  catalog: { title: 'Product catalog', subtitle: 'Prices shown are specific to {customer}.', moq: 'MOQ', uom: 'UOM', yourPrice: 'Your price', listPrice: 'List' },
  cart: { title: 'Cart', empty: 'Your cart is empty', emptyHint: 'Browse the catalog to add products.', checkout: 'Review order', deliveryInfo: 'Delivery information' },
  checkout: { title: 'Review & submit order', submit: 'Submit order', submitOffline: 'Save offline (Pending Sync)', success: 'Order submitted', successOffline: 'Order saved on device' },
  assistant: { title: 'AI Assistant', preview: 'Preview', placeholder: 'Ask about orders, balances, products…', disclaimer: 'Mock responses. Future version will use permission-checked business functions via the backend.' },
  offline: { banner: 'You are offline. Catalog and recent data are served from cache; new orders are saved as Pending Sync.', pending: '{count} order(s) waiting to sync', syncNow: 'Sync now' },
};

export type Dictionary = typeof en;
export default en;
