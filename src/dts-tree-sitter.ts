#!node

/**
 * npm package bin script
 */

import * as lib from './index'

// Run if script invoked directly
if (require.main === module)
{
    lib.main()
}