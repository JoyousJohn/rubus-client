const buildingAbbreviations = [
    {
        "abbr": "AB",
        "number": 3198,
        "name": "Academic Building"
    },
    {
        "abbr": "ABE",
        "number": 3198,
        "name": "Academic Building East"
    },
    {
        "abbr": "ABW",
        "number": 3198,
        "name": "Academic Building West"
    },
    {
        "abbr": "ARC",
        "number": 3878,
        "name": "Allison Road Classrooms",
        "short_name": "Allison Road"
    },
    {
        "abbr": "ARH",
        "number": 8428,
        "name": "Art History Hall",
        "short_name": "Art History"
    },
    {
        "abbr": "BE",
        "number": 4145,
        "name": "Beck Hall",
        "short_name": "Beck"
    },
    {
        "abbr": "BH",
        "number": 3049,
        "name": "Bishop House",
        "short_name": "Bishop"
    },
    {
        "abbr": "BIO",
        "number": 8304,
        "name": "Biological Sciences Building",
        "short_name": "Biological Sciences"
    },
    {
        "abbr": "BME",
        "number": 3893,
        "name": "Biomedical Engineering Building",
        "short_name": "BME"
    },
    {
        "abbr": "BL",
        "number": 6005,
        "name": "Blake Hall",
        "short_name": "Blake"
    },
    {
        "abbr": "BT",
        "number": 6024,
        "name": "Bartlett Hall",
        "short_name": "Bartlett"
    },
    {
        "abbr": "BST",
        "number": 3905,
        "name": "BEST West Residence Hall",
        "short_name": "BEST West"
    },
    {
        "abbr": "CA",
        "number": 3121,
        "name": "Campbell Hall",
        "short_name": "Campbell"
    },
    {
        "abbr": "CCB",
        "number": 3594,
        "name": "Chemistry & Chemical Biology",
        "short_name": "Chemical Biology"
    },
    {
        "abbr": "CDL",
        "number": 8840,
        "name": "Cook Douglass Lecture Hall",
        "short_name": "CD Lecture Hall"
    },
    {
        "abbr": "CI",
        "number": 3134,
        "name": "School of Communication & Information",
        "short_name": "SC&I"
    },
    {
        "abbr": "COR",
        "number": 3883,
        "name": "Computing Research & Education Building",
        "short_name": "CoRE"
    },
    {
        "abbr": "DAV",
        "number": 8322,
        "name": "Davison Hall",
        "short_name": "Davison"
    },
    {
        "abbr": "ED",
        "number": 3037,
        "name": "Graduate School of Education Building",
        "short_name": "GSEB"
    },
    {
        "abbr": "EN",
        "number": 3558,
        "name": "School of Engineering",
        "short_name": "SoE"
    },
    {
        "abbr": "FBO",
        "number": 3869,
        "name": "Fiber Optic Materials Research Building",
        "short_name": "Fiber Optics"
    },
    {
        "abbr": "FH",
        "number": 3117,
        "name": "Frelinghuysen Hall",
        "short_name": "Frelinghuysen"
    },
    {
        "abbr": "FNH",
        "number": 6432,
        "name": "Institute for Food Nutrition & Health",
        "short_name": "IFNH"
    },
    {
        "abbr": "FOR",
        "number": 6347,
        "name": "Foran Hall",
        "short_name": "Foran"
    },
    {
        "abbr": "FS",
        "number": 6246,
        "name": "Food Science & Nutritional Sciences West",
        "short_name": "Food Science"
    },
    {
        "abbr": "HC",
        "number": 3197,
        "name": "Honors College"
    },
    {
        "abbr": "HCK",
        "number": 8311,
        "name": "Hickman Hall",
        "short_name": "Hickman"
    },
    {
        "abbr": "HH",
        "number": 3119,
        "name": "Hardenbergh Hall",
        "short_name": "Hardenbergh"
    },
    {
        "abbr": "HLL",
        "number": 3752,
        "name": "Hill Center for the Mathematical Sciences",
        "short_name": "Hill Center"
    },
    {
        "abbr": "HSB",
        "number": 8302,
        "name": "Regina B. Heldrich Science Building",
        "short_name": "Heldrich Science"
    },
    {
        "abbr": "LOR",
        "number": 8432,
        "name": "Loree Classroom/Office Building",
        "short_name": "Loree"
    },
    {
        "abbr": "LSH",
        "number": 4153,
        "name": "Lucy Stone Hall",
        "short_name": "Lucy Stone"
    },
    {
        "abbr": "KLG",
        "number": 8444,
        "name": "Kathleen W. Ludwig Global Village LLC",
        "short_name": "Ludwig Global Village"
    },
    {
        "abbr": "MI",
        "number": 3010,
        "name": "Milledoler Hall",
        "short_name": "Milledoler"
    },
    {
        "abbr": "MU",
        "number": 3011,
        "name": "Murray Hall",
        "short_name": "Murray"
    },
    {
        "abbr": "PH",
        "number": 3863,
        "name": "Gordon Road Office Building",
        "short_name": "Gordon Road"
    },
    {
        "abbr": "PHY",
        "number": 3562,
        "name": "Physics Lecture Hall",
    },
    {
        "abbr": "RAB",
        "number": 8303,
        "name": "Dr Ruth M. Adams Building",
        "short_name": "Ruth Adams"
    },
    {
        "abbr": "RWH",
        "number": 3913,
        "name": "Richard Weeks Hall of Engineering",
        "short_name": "Richard Weeks"
    },
    {
        "abbr": "SC",
        "number": 3038,
        "name": "Scott Hall",
        "short_name": "Scott"
    },
    {
        "abbr": "SEC",
        "number": 3854,
        "name": "T. Alexander Pond SERC",
        "short_name": "SERC"
    },
    {
        "abbr": "TH",
        "number": 6004,
        "name": "Thompson Hall",
        "short_name": "Thompson"
    },
    {
        "abbr": "TIL",
        "number": 4146,
        "name": "Tillett Hall",
        "short_name": "Tillett"
    },
    {
        "abbr": "VD",
        "number": 3016,
        "name": "Van Dyck Hall",
        "short_name": "Van Dyck"
    },
    {
        "abbr": "VH",
        "number": 3013,
        "name": "Voorhees Hall",
        "short_name": "Voorhees"
    },
    {
        "abbr": "WAL",
        "number": 6000,
        "name": "Waller Hall",
        "short_name": "Waller"
    },
    {
        "abbr": "WL",
        "number": 3556,
        "name": "Wright Rieman Laboratories",
        "short_name": "Rieman Labs"
    },
    {
        "abbr": "ZAM",
        "number": 3013,
        "name": "Zimmerli Art Museum",
        "short_name": "Zimmerli"
    },
    {
        "abbr": "LSC",
        "number": 4160,
        "name": "Livingston Student Center",
        "short_name": "Livingston SC"
    },
    {
        "abbr": "CASC",
        "number": 3133,
        "name": "College Avenue Student Center",
        "short_name": "College Ave SC"
    },
    {
        "abbr": "BSC",
        "number": 3834,
        "name": "Busch Student Center",
        "short_name": "Busch SC"
    },
    {
        "abbr": "CSC",
        "number": 6290,
        "name": "Cook Student Center",
        "short_name": "Cook SC"
    },
    {
        "abbr": "DSC",
        "number": 8320,
        "name": "Douglass Student Center",
        "short_name": "Douglass SC"
    }
];
