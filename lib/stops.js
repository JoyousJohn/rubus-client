const allStopsData = {
    "nb": {
        "1": {
            "name": "College Avenue Student Center",
            "latitude": 40.50337933596179,
            "longitude": -74.45217900425648,
            "campus": "ca",
            "polygon": [[-74.45286,40.50383],[-74.45259,40.50399],[-74.45182,40.50319],[-74.45208,40.5031],[-74.45286,40.50383]],
            "shortName": "Colleve Ave SC"
        },
        "2": {
            "name": "The Yard",
            "latitude": 40.49957,
            "longitude": -74.44824,
            "campus": "ca",
            "polygon": [[-74.44842,40.49965],[-74.44813,40.49939],[-74.44798,40.49948],[-74.44826,40.49973],[-74.44842,40.49965]],
            "shortName": "Yard"
        },
        "3": {
            "name": "Student Activities Center (NB)",
            "latitude": 40.503910197,
            "longitude": -74.448819271,
            "campus": "ca",
            "polygon": [[-74.44967,40.50419],[-74.44938,40.50439],[-74.4486,40.50398],[-74.44884,40.50373],[-74.44967,40.50419]],
            "shortName": "SAC North",
            "mainName": "Student Activities Center"
        },  
        "4": {
            "name": "Student Activities Center (SB)",
            "latitude": 40.504248745,
            "longitude": -74.449741951,
            "campus": "ca",
            "polygon": [[-74.45024,40.50444],[-74.44999,40.50465],[-74.44939,40.5043],[-74.44963,40.50409],[-74.45024,40.50444]],
            "shortName": "SAC South",
            "mainName": "Student Activities Center"
        },



        "5": {
            "name": "Stadium West Lot",
            "latitude": 40.514479,
            "longitude": -74.466153,
            "campus": "busch",
            "polygon": [[-74.46637,40.51457],[-74.46649,40.51425],[-74.46618,40.51417],[-74.46595,40.51458],[-74.46637,40.51457]],
            "shortName": "Stadium"
        },
        "6": {
            "name": "Hill Center (NB)",
            "latitude": 40.52192,
            "longitude": -74.463263,
            "campus": "busch",
            "polygon": [[-74.46378,40.52192],[-74.46336,40.52215],[-74.46282,40.52169],[-74.46337,40.52145],[-74.46378,40.52192]],
            "shortName": "Hill North",
            "mainName": "Hill Center"
        },
        "7": {
            "name": "Hill Center (SB)",
            "latitude": 40.521872,
            "longitude": -74.463417,
            "campus": "busch",
            "polygon": [[-74.46377,40.52199],[-74.46357,40.52208],[-74.46314,40.52197],[-74.46304,40.52157],[-74.46326,40.52155],[-74.46377,40.52199]],
            "shortName": "Hill South",
            "mainName": "Hill Center"
        },
        "8": {
            "name": "Allison Road Classrooms",
            "latitude": 40.52356,
            "longitude": -74.465190671,
            "campus": "busch",
            "polygon": [[-74.46571,40.5235],[-74.46503,40.5233],[-74.46432,40.52371],[-74.46499,40.52409],[-74.46571,40.5235]],
            "shortName": "Allison"
        },
        "9": {
            "name": "Science Building",
            "latitude": 40.523938,
            "longitude": -74.464221,
            "campus": "busch",
            "polygon": [[-74.46437,40.5241],[-74.46451,40.52385],[-74.46482,40.52378],[-74.4648,40.52352],[-74.46419,40.52354],[-74.46392,40.52402],[-74.46437,40.5241]]
        },
        "10": {
            "name": "Busch Student Center",
            "latitude": 40.523746605,
            "longitude": -74.45837306,
            "campus": "busch",
            "polygon": [[-74.45868,40.52433],[-74.45895,40.5241],[-74.45849,40.52391],[-74.45815,40.52363],[-74.45799,40.52328],[-74.45773,40.52327],[-74.45794,40.52364],[-74.4583,40.52407],[-74.45868,40.52433]],
            "shortName": "Busch SC"
        },
        "11": {
            "name": "Werblin Recreation Center (SB)",
            "latitude": 40.518637,
            "longitude": -74.459854,
            "campus": "busch",
            "polygon": [[-74.46035,40.51865],[-74.46006,40.51838],[-74.45943,40.51881],[-74.45973,40.51901],[-74.46035,40.51865]],
            "shortName": "Werblin South",
            "mainName": "Werblin Rec Center"
        },
        "27": {
            "name": "Werblin Recreation Center (NB)",
            "latitude": 40.518775,
            "longitude": -74.459971,
            "campus": "busch",
            "shortName": "Werblin North",
            "mainName": "Werblin Rec Center"
        },
        


        "12": {
            "name": "Livingston Plaza",
            "latitude": 40.525106,
            "longitude": -74.438584,
            "campus": "livingston",
            "polygon": [[-74.43856,40.52543],[-74.43821,40.52524],[-74.43871,40.52473],[-74.43909,40.52495],[-74.43856,40.52543]],
            "shortName": "Livi Plaza"
        },
        "13": {
            "name": "Livingston Student Center",
            "latitude": 40.524,
            "longitude": -74.43663,
            "campus": "livingston",
            "polygon": [[-74.43644,40.52441],[-74.4367,40.52417],[-74.43663,40.5237],[-74.43633,40.52351],[-74.4361,40.52367],[-74.43622,40.524],[-74.43614,40.52424],[-74.43644,40.52441]],
            "shortName": "Livingston SC"
        },
        "14": {
            "name": "Quads",
            "latitude": 40.519863,
            "longitude": -74.433567,
            "campus": "livingston",
            "polygon": [[-74.43345,40.52019],[-74.43379,40.51977],[-74.43341,40.51965],[-74.43312,40.52003],[-74.43345,40.52019]]
        },
        "15": {
            "name": "Busch-Livingston Health Center",
            "latitude": 40.523479,
            "longitude": -74.442508,
            "campus": "livingston",
            "polygon": [[-74.4429,40.52357],[-74.44284,40.52366],[-74.44219,40.5235],[-74.44226,40.52342],[-74.4429,40.52357]]
        },



        "16": {
            "name": "College Hall",
            "latitude": 40.48567366616381,
            "longitude": -74.437428277946,
            "campus": "douglas",
            "polygon": [[-74.43803,40.48562],[-74.43767,40.48598],[-74.43677,40.48555],[-74.43717,40.48519],[-74.43803,40.48562]]
        },
        "17": {
            "name": "Red Oak Lane",
            "latitude": 40.48298694,
            "longitude": -74.437534636,
            "campus": "cook",
            "polygon": [[-74.43745,40.48319],[-74.43791,40.48276],[-74.43773,40.48268],[-74.43727,40.4831],[-74.43745,40.48319]],
            "shortName": "Red Oak"
        },
        "18": {
            "name": "Lipman Hall",
            "latitude": 40.481294,
            "longitude": -74.436266,
            "campus": "cook",
            "polygon": [[-74.43625,40.48137],[-74.43655,40.48108],[-74.43639,40.481],[-74.43612,40.48128],[-74.43625,40.48137]],
            "shortName": "Lipman"
        },
        "19": {
            "name": "Biel Road",
            "latitude": 40.48,
            "longitude": -74.432522,
            "campus": "cook",
            "polygon": [[-74.43295,40.48008],[-74.4329,40.47981],[-74.43221,40.47986],[-74.43232,40.48017],[-74.43295,40.48008]],
            "shortName": "Biel"
        },
        "20": {
            "name": "Henderson",
            "latitude": 40.48095,
            "longitude": -74.42872,
            "campus": "cook",
            "polygon": [[-74.42913,40.4812],[-74.42872,40.4809],[-74.42854,40.48103],[-74.42893,40.48129],[-74.42913,40.4812]]
        },
        "21": {
            "name": "Gibbons",
            "latitude": 40.48523,
            "longitude": -74.43194,
            "campus": "cook",
            "polygon": [[-74.43232,40.48505],[-74.43216,40.48499],[-74.43188,40.48505],[-74.43188,40.48538],[-74.4322,40.48529],[-74.43232,40.48505]]
        },
        


        "22": {
            "name": "SoCam Apts (NB)",
            "latitude": 40.4923208,
            "longitude": -74.4428485,
            "campus": "downtown",
            "polygon": [[-74.44302,40.49244],[-74.44295,40.49216],[-74.44195,40.49226],[-74.44206,40.49256],[-74.44302,40.49244]],
            "shortName": "SoCam North",
            "mainName": "SoCam Apts"
        },
        "23": {
            "name": "SoCam Apts (SB)",
            "latitude": 40.491856,
            "longitude": -74.443093,
            "campus": "downtown",
            "polygon": [[-74.44344,40.49217],[-74.44313,40.49224],[-74.44283,40.4918],[-74.44313,40.49167],[-74.44344,40.49217]],
            "shortName": "SoCam South",
            "mainName": "SoCam Apts"
        },



        "24": {
            "name": "Jersey Mike's Arena",
            "latitude": 40.524467,
            "longitude": -74.440835,
            "campus": "livingston",
            "polygon": [[-74.44079,40.5244],[-74.44062,40.5245],[-74.44029,40.5243],[-74.44045,40.52417],[-74.44079,40.5244]],
            "shortName": "JMA"
        },
        "25": {
            "name": "The Bubble",
            "latitude": 40.516373,
            "longitude": -74.4662887,
            "campus": "busch",
            "polygon": [[-74.46618,40.51653],[-74.46462,40.5159],[-74.46452,40.51609],[-74.46607,40.51669],[-74.46618,40.51653]]
        },
        "26": {
            "name": "Rodkin Academic Center",
            "latitude": 40.51589712284494,
            "longitude": -74.4629105112253,
            "campus": "busch",
            "polygon": [[-74.46311,40.51561],[-74.46298,40.51582],[-74.46276,40.51573],[-74.46286,40.51554],[-74.46311,40.51561]],
            "shortName": "Rodkin"
        }
    },
    "newark": {
        "1": {
            "name": "Boyden Hall",
            "latitude": 40.74099560151841,
            "longitude": -74.17440534432667,
            "campus": "newark",
        },
        "2": {
            "name": "NJIT (NB)",
            "latitude": 40.74123432401285,
            "longitude": -74.17887379174985,
            "campus": "newark",
            "mainName": "NJIT"
        },
        "3": {
            "name": "NJIT (SB)",
            "latitude": 40.74111757322249,
            "longitude": -74.17890541878309,
            "campus": "newark",
            "mainName": "NJIT"
        },
        "4": {
            "name": "International Center for Public Health (NB)",
            "latitude": 40.74285348611284,
            "longitude": -74.18403481852225,
            "campus": "newark",
            "mainName": "ICPH"
        },
        "5": {
            "name": "International Center for Public Health (SB)",
            "latitude": 40.742757065300346,
            "longitude": -74.18381275321057,
            "campus": "newark",
            "mainName": "ICPH"
        },
        "6": {
            "name": "Bergen Building (Front)",
            "latitude": 40.74333047116301,
            "longitude": -74.19127370711958,
            "campus": "newark",
            "mainName": "Bergen Building"
        },
        "7": {
            "name": "Bergen Building (Back)",
            "latitude": 40.743465824048435,
            "longitude": -74.19246290624436,
            "campus": "newark",
            "mainName": "Bergen Building"
        },
        "8": {
            "name": "Medical School Building",
            "latitude": 40.73966019178433,
            "longitude": -74.18927711733195,
            "campus": "newark"
        },
        "9": {
            "name": "Essex County College",
            "latitude": 40.73629922050911,
            "longitude": -74.17930438552004,
            "campus": "newark"
        },
        "10": {
            "name": "Center for Law and Justice",
            "latitude": 40.74128811150586,
            "longitude": -74.17214734214596,
            "campus": "newark"
        },
        "11": {
            "name": "Washington Park",
            "latitude": 40.743414,
            "longitude": -74.1708519,
            "campus": "newark"
        },
        "12": {
            "name": "Broad Street",
            "latitude": 40.74679924703696,
            "longitude": -74.17122466224502,
            "campus": "newark"
        },
        "13": {
            "name": "University North",
            "latitude": 40.746092091479426,
            "longitude": -74.17185766357296,
            "campus": "newark"
        },
        "14": {
            "name": "Physical Plant",
            "latitude": 40.7443932617669,
            "longitude": -74.17259795326156,
            "campus": "newark"
        },
        "15": {
            "name": "Penn Station",
            "latitude": 40.73484618632327,
            "longitude": -74.16462758259561,
            "campus": "newark"
        },
        "16": {
            "name": "Hospital",
            "latitude": 40.74176811404989,
            "longitude": -74.19163895437279,
            "campus": "newark"
        },
        "17": {
            "name": "Dental School",
            "latitude": 40.7422665,
            "longitude": -74.1901508,
            "campus": "newark"
        },
        "18": {
            "name": "180 W Market St",
            "latitude": 40.74116699803276,
            "longitude": -74.1867126995002,
            "campus": "newark"
        },
        "19": {
            "name": "Blumenthal Hall",
            "latitude": 40.73910387447692,
            "longitude": -74.17536931600073,
            "campus": "newark"
        },
    },
    "camden": {
        "1": {
            "name": "City Lot 15",
            "latitude": 39.9525221,
            "longitude": -75.1265801,
            "campus": "camden",
        },
        "2": {
            "name": "City Lot 16",
            "latitude": 39.95325912501778, 
            "longitude": -75.12587442320957,
            "campus": "camden",
        },
        "3": {
            "name": "Rutgers Law School",
            "latitude": 39.94752641003339,
            "longitude": -75.12077610858988,   
            "campus": "camden", 
        },
        "4": {
            "name": "Nuring And Sciences Building",
            "latitude": 39.944068418800775,
            "longitude": -75.12062027574976,
            "campus": "camden",
        },
        "5": {
            "name": "Joint Health Sciences Center",
            "latitude": 39.94236069110408,
            "longitude": -75.1198859696834,
            "campus": "camden",
        },
        "6": {
            "name": "Business and Sciences Center",
            "latitude": 39.948615224766186, 
            "longitude": -75.12354556281815,
            "campus": "camden",
        }
    }
}