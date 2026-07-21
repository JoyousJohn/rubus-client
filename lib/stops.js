const allStopsData = {
    "nb": {
        "1": {
            "name": "College Avenue Student Center",
            "latitude": 40.50337933596179,
            "longitude": -74.45217900425648,
            "campus": "ca",
            "shortName": "Colleve Ave SC",
            "shorterName": "CASC"
        },
        "2": {
            "name": "The Yard",
            "latitude": 40.49957,
            "longitude": -74.44824,
            "campus": "ca",
            "shortName": "Yard"
        },
        "3": {
            "name": "Student Activities Center (NB)",
            "latitude": 40.503910197,
            "longitude": -74.448819271,
            "campus": "ca",
            "shortName": "SAC North",
            "mainName": "Student Activities Center"
        },  
        "4": {
            "name": "Student Activities Center (SB)",
            "latitude": 40.504248745,
            "longitude": -74.449741951,
            "campus": "ca",
            "shortName": "SAC South",
            "mainName": "Student Activities Center"
        },



        "5": {
            "name": "Stadium West Lot",
            "latitude": 40.514479,
            "longitude": -74.466153,
            "campus": "busch",
            "shortName": "Stadium"
        },
        "6": {
            "name": "Hill Center (NB)",
            "latitude": 40.52192,
            "longitude": -74.463263,
            "campus": "busch",
            "shortName": "Hill North",
            "mainName": "Hill Center",
        },
        "7": {
            "name": "Hill Center (SB)",
            "latitude": 40.521872,
            "longitude": -74.463417,
            "campus": "busch",
            "shortName": "Hill South",
            "mainName": "Hill Center"
        },
        "8": {
            "name": "Allison Road Classrooms",
            "latitude": 40.52356,
            "longitude": -74.465190671,
            "campus": "busch",
            "shortName": "Allison",
            "mainName": "Allison Road Clsrms"
        },
        "9": {
            "name": "Science Building",
            "latitude": 40.523938,
            "longitude": -74.464221,
            "campus": "busch",
            "mainName": "Science Building"
        },
        "10": {
            "name": "Busch Student Center",
            "latitude": 40.523746605,
            "longitude": -74.45837306,
            "campus": "busch",
            "shortName": "Busch SC"
        },
        "11": {
            "name": "Werblin Recreation Center (SB)",
            "latitude": 40.518637,
            "longitude": -74.459854,
            "campus": "busch",
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
            "shortName": "Livi Plaza"
        },
        "13": {
            "name": "Livingston Student Center",
            "latitude": 40.524,
            "longitude": -74.43663,
            "campus": "livingston",
            "shortName": "Livingston SC"
        },
        "14": {
            "name": "Quads",
            "latitude": 40.519863,
            "longitude": -74.433567,
            "campus": "livingston",
        },
        "15": {
            "name": "Busch-Livingston Health Center",
            "latitude": 40.523479,
            "longitude": -74.442508,
            "campus": "livingston",
        },



        "16": {
            "name": "College Hall",
            "latitude": 40.48567366616381,
            "longitude": -74.437428277946,
            "campus": "douglas",
        },
        "17": {
            "name": "Red Oak Lane",
            "latitude": 40.48298694,
            "longitude": -74.437534636,
            "campus": "cook",
            "shortName": "Red Oak"
        },
        "18": {
            "name": "Lipman Hall",
            "latitude": 40.481294,
            "longitude": -74.436266,
            "campus": "cook",
            "shortName": "Lipman"
        },
        "19": {
            "name": "Biel Road",
            "latitude": 40.48,
            "longitude": -74.432522,
            "campus": "cook",
            "shortName": "Biel"
        },
        "20": {
            "name": "Henderson",
            "latitude": 40.48095,
            "longitude": -74.42872,
            "campus": "cook",
        },
        "21": {
            "name": "Gibbons",
            "latitude": 40.48523,
            "longitude": -74.43194,
            "campus": "cook",
        },
        


        "22": {
            "name": "SoCam Apts (NB)",
            "latitude": 40.4923208,
            "longitude": -74.4428485,
            "campus": "downtown",
            "shortName": "SoCam North",
            "mainName": "SoCam Apts"
        },
        "23": {
            "name": "SoCam Apts (SB)",
            "latitude": 40.491856,
            "longitude": -74.443093,
            "campus": "downtown",
            "shortName": "SoCam South",
            "mainName": "SoCam Apts"
        },



        "24": {
            "name": "Jersey Mike's Arena",
            "latitude": 40.524467,
            "longitude": -74.440835,
            "campus": "livingston",
            "shortName": "JMA"
        },
        "25": {
            "name": "The Bubble",
            "latitude": 40.516373,
            "longitude": -74.4662887,
            "campus": "busch",
        },
        "26": {
            "name": "Rodkin Academic Center",
            "latitude": 40.51589712284494,
            "longitude": -74.4629105112253,
            "campus": "busch",
            "shortName": "Rodkin"
        },
        "27": {
            "name": "RWJMS Research Tower",
            "latitude": 40.5246777432346,
            "longitude": -74.4701401578115,
            "campus": "busch",
            "shortName": "RWJMS"
        },
        "28": {
            "name": "HELIX H-1",
            "latitude": 40.4961841154017,
            "longitude": -74.4465395811827,
            "campus": "downtown",
            "shortName": "Helix H1"
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
