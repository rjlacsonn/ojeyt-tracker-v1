/* Navigation follows database-confirmed account access, never editable auth metadata. */
const AccountAccess = (() => {
  const studentPages = ['dashboard', 'history', 'documents', 'badges', 'settings'];
  function home(user) {
    if (user?.accountType === 'student') return user.accountStatus === 'active' ? 'dashboard' : 'student-home';
    if (user?.accountType === 'professor' && user.accountStatus === 'active') return 'student-approvals';
    return 'account-unavailable';
  }
  function canVisit(user, page) {
    if (user?.accountType === 'student') return user.accountStatus === 'active'
      ? studentPages.includes(page) : ['student-home', 'settings'].includes(page);
    if (user?.accountType === 'professor' && user.accountStatus === 'active') {
      return ['settings', 'professor-home', 'student-approvals', 'document-review'].includes(page);
    }
    return page === 'account-unavailable';
  }
  async function load(client) {
    const { data, error } = await client.rpc('ojt_account_context');
    if (error) throw error;
    if (!data || !['student', 'professor'].includes(data.account_type) ||
        !['active', 'pending'].includes(data.status)) {
      throw new Error('Account access could not be confirmed.');
    }
    if (data.account_type === 'professor' && data.status !== 'active') {
      const outdated = new Error('The student approval migration has not been applied.');
      outdated.code = 'OJT_APPROVAL_SETUP_REQUIRED';
      throw outdated;
    }
    return { accountType: data.account_type, accountStatus: data.status,
      institution: data.institution || '', department: data.department || '',
      recipientId: data.recipient_id || null, recipientName: data.recipient_name || '' };
  }
  function describeError(error) {
    if (['PGRST202', 'PGRST205', '42P01', '42883', 'OJT_APPROVAL_SETUP_REQUIRED'].includes(error?.code)) {
      return { title: 'Account setup is incomplete',
        message: 'Your account exists, but account verification is not available yet. Ask the project administrator to finish the account setup, then select Retry. You do not need to register again.' };
    }
    if (error?.code === '42501') {
      return { title: 'Account verification needs permission',
        message: 'Your account exists, but account verification is blocked. Ask the project administrator to check account permissions, then select Retry.' };
    }
    return { title: 'Account access unavailable',
      message: 'We could not confirm your account access. Please retry or contact the project administrator.' };
  }
  return { home, canVisit, load, describeError };
})();
if (typeof module !== 'undefined') module.exports = AccountAccess;
