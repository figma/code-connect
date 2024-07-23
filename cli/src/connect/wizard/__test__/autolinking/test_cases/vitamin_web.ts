import { AutolinkingTestCase } from '../types'

const vitaminWeb: AutolinkingTestCase = {
  name: 'Vitamin - web',
  passThreshold: 0.85, // remaining failures due to non-matching names (more context required)
  figmaComponents: [
    {
      name: '_Utitlies/Header',
      id: '10848:26165',
    },
    {
      name: '_Utilities/Slot',
      id: '7343:17922',
    },
    {
      name: 'Inline link/Large/Off/Focus',
      id: '1576:92',
    },
    {
      name: '_Inline link/Medium/Off/Focus',
      id: '1576:81',
    },
    {
      name: '_Inline link/Small/Off/Focus',
      id: '1576:7',
    },
    {
      name: '_Standalone link/Large/Off/Off/Focus',
      id: '1207:8990',
    },
    {
      name: '_Standalone link/Medium/Off/Off/Focus',
      id: '1207:8980',
    },
    {
      name: '_Standalone link/Large/Off/On/Focus',
      id: '1207:8966',
    },
    {
      name: '_Standalone link/Medium/Off/On/Focus',
      id: '1207:8945',
    },
    {
      name: '_Standalone link/Small/Off/On/Focus',
      id: '1207:8924',
    },
    {
      name: '_Standalone link/Small/Off/Off/Focus',
      id: '1207:8907',
    },
    {
      name: '_Button/Primary/Large/False/No icon/Focus',
      id: '72:2317',
    },
    {
      name: 'Accordion',
      id: '8029:29057',
    },
    {
      name: '_Accordion utilities/Item',
      id: '8029:28243',
    },
    {
      name: 'Card',
      id: '4398:11429',
    },
    {
      name: '_Card utilities/Media top',
      id: '4398:11469',
    },
    {
      name: '_Card utilities/Media full',
      id: '4398:11462',
    },
    {
      name: '_Card utilities/Container',
      id: '4818:10883',
    },
    {
      name: '_Card utilities/Actions',
      id: '4398:11420',
    },
    {
      name: '_Card utilities/Thumbnail',
      id: '4398:11411',
    },
    {
      name: '_Card utilities/Title + description',
      id: '4398:11408',
    },
    {
      name: '_Card utilities/Additional informations',
      id: '4398:11395',
    },
    {
      name: '_Card utilities/Aspect ratio',
      id: '4398:11466',
    },
    {
      name: 'Divider',
      id: '6871:13107',
    },
    {
      name: 'List',
      id: '9202:20731',
    },
    {
      name: '_List utilities/List item separator',
      id: '9202:20777',
    },
    {
      name: '_List utilities/List Item Content',
      id: '9194:18894',
    },
    {
      name: '_List utilities/List item',
      id: '9194:18713',
    },
    {
      name: '_List utilities/Enhancing elements/Slot',
      id: '9194:18752',
    },
    {
      name: '_List utilities/Enhancing elements/Action',
      id: '9194:18753',
    },
    {
      name: '_List utilities/Generic content placeholder',
      id: '9194:18706',
    },
    {
      name: '_List utilities/Media',
      id: '6936:16763',
    },
    {
      name: '_List utilities/Action',
      id: '6936:16357',
    },
    {
      name: 'Skeleton',
      id: '3451:10738',
    },
    {
      name: 'Checkbox',
      id: '783:9869',
    },
    {
      name: 'Chip',
      id: '4652:11424',
    },
    {
      name: '_Chip utilities/Medium',
      id: '4672:14662',
    },
    {
      name: '_Chip utilities/Small',
      id: '4594:10821',
    },
    {
      name: 'Quantity',
      id: '6937:16423',
    },
    {
      name: '_Quantity utilities/Button',
      id: '6937:16719',
    },
    {
      name: '_Quantity utilities/Input',
      id: '6937:16698',
    },
    {
      name: 'Radio',
      id: '359:30',
    },
    {
      name: 'Toggle',
      id: '612:1192',
    },
    {
      name: 'Alert',
      id: '2983:15032',
    },
    {
      name: 'Modal',
      id: '2993:12130',
    },
    {
      name: 'Popover',
      id: '2756:10788',
    },
    {
      name: '_Popover utilities/Base',
      id: '2756:10785',
    },
    {
      name: 'Snackbar',
      id: '2796:12600',
    },
    {
      name: 'Toast',
      id: '2790:10831',
    },
    {
      name: 'Tooltip',
      id: '11099:29077',
    },
    {
      name: '_Tooltip utilities/Base',
      id: '2756:10783',
    },
    {
      name: '_Breadcrumb utilities/More',
      id: '6170:13071',
    },
    {
      name: '_Breadcrumb utilities/End',
      id: '6170:13073',
    },
    {
      name: '_Breadcrumb utilities/Middle',
      id: '6170:13072',
    },
    {
      name: '_Breadcrumb utilities/Start',
      id: '6170:12987',
    },
    {
      name: 'Breadcrumb',
      id: '6063:13272',
    },
    {
      name: 'Navbar',
      id: '10847:27832',
    },
    {
      name: '_Search utilities/Search button',
      id: '6527:13865',
    },
    {
      name: '_Search utilities/Clear button',
      id: '6529:14096',
    },
    {
      name: '_Search utilities/Icon button',
      id: '6529:15053',
    },
    {
      name: 'Search',
      id: '6527:15021',
    },
    {
      name: '_Tabs utilities/List',
      id: '6840:13207',
    },
    {
      name: '_Tabs utilities/Variants',
      id: '6840:13140',
    },
    {
      name: '_Tabs utilities/States',
      id: '6840:13272',
    },
    {
      name: 'Tabs',
      id: '6840:14866',
    },
    {
      name: '_Rating utilities/Star',
      id: '2573:9367',
    },
    {
      name: 'Rating - Read only',
      id: '2573:9424',
    },
    {
      name: 'Rating - Interactive',
      id: '2802:10337',
    },
    {
      name: 'Progressbar (Linear)',
      id: '2887:11057',
    },
    {
      name: 'Progressbar (Circular)',
      id: '3010:11433',
    },
    {
      name: 'Tag',
      id: '7492:18228',
    },
    {
      name: 'Price',
      id: '7639:18237',
    },
    {
      name: 'Loader',
      id: '3014:11530',
    },
    {
      name: 'Badge',
      id: '2603:9428',
    },
    {
      name: 'Select',
      id: '2535:52',
    },
    {
      name: 'Text area',
      id: '151:5704',
    },
    {
      name: 'Text input',
      id: '150:4893',
    },
    {
      name: 'Link',
      id: '1207:8900',
    },
    {
      name: 'Button',
      id: '1866:31',
    },
    {
      name: '_button construction/Small icon alone',
      id: '12688:30430',
    },
    {
      name: '_button construction/Medium icon alone',
      id: '12688:30431',
    },
    {
      name: '_button construction/Large icon alone',
      id: '12688:30432',
    },
    {
      name: '_button construction/Small text+icons',
      id: '69:20',
    },
    {
      name: '_button construction/Medium text+icons',
      id: '67:596',
    },
    {
      name: '_button construction/Large text+icons',
      id: '67:59',
    },
    {
      name: 'Dropdown',
      id: '2421:3',
    },
    {
      name: 'Dropdown menu item',
      id: '3152:12884',
    },
    {
      name: 'Dropdown menu',
      id: '3152:13063',
    },
    {
      name: 'Spacer',
      id: '1175:8966',
    },
    {
      name: '_ Contribution Companion',
      id: '12748:30571',
    },
    {
      name: '_ FileEditorRow',
      id: '12748:30561',
    },
    {
      name: '_ EditorAvatar',
      id: '12748:30558',
    },
    {
      name: '_ ContributionCeckbox',
      id: '12748:30552',
    },
    {
      name: '_Cover',
      id: '39:33',
    },
  ],
  componentPaths: [
    '/Users/foo/vitamin-web/packages/sources/react/src/guidelines/iconography/VtmnIcon/VtmnIcon.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnSkeleton/VtmnSkeleton.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnList/VtmnList.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnDivider/VtmnDivider.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnCard/VtmnCard.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnAccordion/VtmnAccordion.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/selection-controls/VtmnToggle/VtmnToggle.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/selection-controls/VtmnRadioButton/VtmnRadioButton.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/selection-controls/VtmnQuantity/VtmnQuantity.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/selection-controls/VtmnChip/VtmnChip.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/selection-controls/VtmnCheckbox/VtmnCheckbox.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnTooltip/VtmnTooltip.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnToast/VtmnToast.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnSnackbar/VtmnSnackbar.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnPopover/VtmnPopover.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnModal/VtmnModal.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnAlert/VtmnAlert.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnTabs/VtmnTabsItem.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnTabs/VtmnTabs.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnSearch/VtmnSearch.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnNavbarLink/VtmnNavbarLink.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnNavbar/VtmnNavbar.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnBreadcrumb/VtmnBreadcrumbItem.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnBreadcrumb/VtmnBreadcrumb.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnTag/VtmnTag.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnRating/VtmnRating.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnProgressbar/VtmnProgressbar.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnPrice/VtmnPrice.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnLoader/VtmnLoader.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnBadge/VtmnBadge.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/forms/VtmnTextInput/VtmnTextInput.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/forms/VtmnSelect/VtmnSelect.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/actions/VtmnLink/VtmnLink.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/actions/VtmnDropdown/VtmnDropdownItem.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/actions/VtmnDropdown/VtmnDropdown.tsx',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/actions/VtmnButton/VtmnButton.tsx',
  ],
  perfectResult: {
    // simple matches
    '3451:10738' /* Skeleton */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnSkeleton/VtmnSkeleton.tsx',
    '9202:20731' /* List */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnList/VtmnList.tsx',
    '6871:13107' /* Divider */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnDivider/VtmnDivider.tsx',
    '4398:11429' /* Card */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnCard/VtmnCard.tsx',
    '8029:29057' /* Accordion */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnAccordion/VtmnAccordion.tsx',
    '612:1192' /* Toggle */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/selection-controls/VtmnToggle/VtmnToggle.tsx',
    '6937:16423' /* Quantity */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/selection-controls/VtmnQuantity/VtmnQuantity.tsx',
    '4652:11424' /* Chip */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/selection-controls/VtmnChip/VtmnChip.tsx',
    '783:9869' /* Checkbox */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/selection-controls/VtmnCheckbox/VtmnCheckbox.tsx',
    '11099:29077' /* Tooltip */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnTooltip/VtmnTooltip.tsx',
    '2790:10831' /* Toast */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnToast/VtmnToast.tsx',
    '2796:12600' /* Snackbar */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnSnackbar/VtmnSnackbar.tsx',
    '2756:10788' /* Popover */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnPopover/VtmnPopover.tsx',
    '2993:12130' /* Modal */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnModal/VtmnModal.tsx',
    '2983:15032' /* Alert */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnAlert/VtmnAlert.tsx',
    '6840:14866' /* Tabs */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnTabs/VtmnTabs.tsx',
    '6527:15021' /* Search */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnSearch/VtmnSearch.tsx',
    '10847:27832' /* Navbar */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnNavbar/VtmnNavbar.tsx',
    '6063:13272' /* Breadcrumb */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnBreadcrumb/VtmnBreadcrumb.tsx',
    '7492:18228' /* Tag */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnTag/VtmnTag.tsx',
    '7639:18237' /* Price */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnPrice/VtmnPrice.tsx',
    '3014:11530' /* Loader */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnLoader/VtmnLoader.tsx',
    '2603:9428' /* Badge */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnBadge/VtmnBadge.tsx',
    '150:4893' /* Text input */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/forms/VtmnTextInput/VtmnTextInput.tsx',
    '2535:52' /* Select */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/forms/VtmnSelect/VtmnSelect.tsx',
    '1207:8900' /* Link */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/actions/VtmnLink/VtmnLink.tsx',
    '2421:3' /* Dropdown */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/actions/VtmnDropdown/VtmnDropdown.tsx',
    '1866:31' /* Button */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/actions/VtmnButton/VtmnButton.tsx',

    // name not an exact match
    '359:30' /* Radio */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/selection-controls/VtmnRadioButton/VtmnRadioButton.tsx',
    '3152:12884' /* Dropdown menu item */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/actions/VtmnDropdown/VtmnDropdownItem.tsx',

    // same code definition handles multiple components
    '2573:9424' /* Rating - Read only */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnRating/VtmnRating.tsx',
    '2802:10337' /* Rating - Interactive */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnRating/VtmnRating.tsx',
    '2887:11057' /* Progressbar (Linear) */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnProgressbar/VtmnProgressbar.tsx',
    '3010:11433' /* Progressbar (Circular) */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnProgressbar/VtmnProgressbar.tsx',
  },
}

export default vitaminWeb
