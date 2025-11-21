import pandas as pd
import json
from datetime import datetime
import re
from typing import Dict, List, Optional, Any
from pymongo import MongoClient

class CannabisLicenseSeeder:
    def __init__(self, folder_path: str, connection_string: str, database_name: str = 'cannabis_licenses'):
        self.folder_path = folder_path
        self.connection_string = connection_string
        self.database_name = database_name
        self.collection_name = 'newlicenserecords'
        
    def load_excel_files(self) -> List[pd.DataFrame]:
        """Load all Excel files from the folder"""
        import os
        
        dataframes = []
        
        if not os.path.exists(self.folder_path):
            print(f"Error: Folder not found: {self.folder_path}")
            return dataframes
        
        files = [f for f in os.listdir(self.folder_path) if f.endswith(('.xlsx', '.xls', '.csv'))]
        
        if not files:
            print("No Excel or CSV files found in the folder")
            return dataframes
        
        print(f"Found {len(files)} files to process")
        
        for file in files:
            file_path = os.path.join(self.folder_path, file)
            try:
                if file.endswith('.csv'):
                    df = pd.read_csv(file_path)
                else:
                    df = pd.read_excel(file_path)
                
                print(f"Loaded {len(df)} records from {file}")
                print(f"Columns: {list(df.columns)}")
                dataframes.append(df)
            except Exception as e:
                print(f"Error loading {file}: {e}")
        
        return dataframes
    
    def clean_string(self, value) -> Optional[str]:
        """Clean and normalize string values"""
        if pd.isna(value) or value == '' or str(value).strip() == '':
            return None
        return str(value).strip()
    
    def parse_phone_number(self, phone: str) -> Optional[str]:
        """Clean and format phone numbers"""
        if not phone or pd.isna(phone):
            return None
        
        digits_only = re.sub(r'\D', '', str(phone))
        
        if len(digits_only) == 10:
            return f"({digits_only[:3]}) {digits_only[3:6]}-{digits_only[6:]}"
        elif len(digits_only) == 11 and digits_only[0] == '1':
            return f"1-({digits_only[1:4]}) {digits_only[4:7]}-{digits_only[7:]}"
        
        return digits_only if digits_only else None
    
    def parse_date(self, date_value) -> Optional[datetime]:
        """Parse date from various formats"""
        if pd.isna(date_value) or date_value is None:
            return None
        
        if isinstance(date_value, datetime):
            return date_value
        
        if isinstance(date_value, (int, float)):
            try:
                return pd.to_datetime('1899-12-30') + pd.Timedelta(days=date_value)
            except:
                return None
        
        if isinstance(date_value, str):
            try:
                return pd.to_datetime(date_value)
            except:
                return None
        
        return None
    
    def parse_boolean(self, value) -> bool:
        """Parse boolean values"""
        if isinstance(value, bool):
            return value
        if pd.isna(value):
            return False
        if isinstance(value, str):
            return value.lower() in ['true', 'yes', '1']
        if isinstance(value, (int, float)):
            return value == 1
        return False
    
    def parse_number(self, value) -> Optional[float]:
        """Parse numeric values"""
        if pd.isna(value):
            return None
        try:
            return float(value)
        except:
            return None
    
    def parse_json_field(self, value) -> Optional[Any]:
        """Parse JSON fields"""
        if pd.isna(value) or not value:
            return None
        
        if isinstance(value, (dict, list)):
            return value
        
        if isinstance(value, str):
            try:
                return json.loads(value)
            except:
                return None
        
        return None
    
    def parse_array_field(self, value) -> List[str]:
        """Parse array/list fields"""
        if pd.isna(value) or not value:
            return []
        
        if isinstance(value, list):
            return [str(item).strip() for item in value if item]
        
        if isinstance(value, str):
            # Try parsing as JSON first
            try:
                parsed = json.loads(value)
                if isinstance(parsed, list):
                    return [str(item).strip() for item in parsed if item]
            except:
                pass
            
            # Split by common delimiters
            if ',' in value:
                return [item.strip() for item in value.split(',') if item.strip()]
            elif ';' in value:
                return [item.strip() for item in value.split(';') if item.strip()]
            elif '|' in value:
                return [item.strip() for item in value.split('|') if item.strip()]
            
            return [value.strip()]
        
        return []
    
    def parse_coordinates(self, lat, lng) -> Optional[List[float]]:
        """Parse and validate coordinates"""
        try:
            latitude = float(lat)
            longitude = float(lng)
            
            if pd.isna(latitude) or pd.isna(longitude):
                return None
            
            if latitude < -90 or latitude > 90 or longitude < -180 or longitude > 180:
                return None
            
            return [longitude, latitude]  # GeoJSON format [lng, lat]
        except:
            return None
    
    def determine_license_type(self, establishment_name: str) -> str:
        """Determine license type based on establishment name"""
        if not establishment_name:
            return 'retail'
        
        name = establishment_name.lower()
        
        if any(word in name for word in ['cultivation', 'grow', 'farm', 'grower']):
            return 'cultivation'
        elif any(word in name for word in ['processing', 'extraction', 'manufacturing', 'processor']):
            return 'processing'
        elif any(word in name for word in ['distribution', 'transport', 'delivery', 'distributor']):
            return 'distribution'
        elif any(word in name for word in ['testing', 'lab', 'laboratory']):
            return 'testing'
        else:
            return 'retail'
    
    def is_smoke_shop(self, establishment_name: str) -> bool:
        """Determine if establishment is a smoke shop"""
        if not establishment_name:
            return False
        
        name = establishment_name.lower()
        return any(word in name for word in ['smoke', 'tobacco', 'cigar']) and 'cannabis' not in name
    
    def transform_row_to_document(self, row) -> Dict[str, Any]:
        """Transform a single row to match the MongoDB schema"""
        
        # Basic Business Information
        business_name = self.clean_string(
            row.get('name') or row.get('business_name') or row.get('Establishment Name')
        )
        license_number = self.clean_string(
            row.get('license_number') or row.get('Licence')
        )
        
        # Google Maps Identifiers
        place_id = self.clean_string(row.get('place_id'))
        google_id = self.clean_string(row.get('google_id'))
        
        # Contact Information
        phone = self.parse_phone_number(row.get('phone') or row.get('Phone'))
        email = self.clean_string(row.get('email'))
        website = self.clean_string(row.get('site') or row.get('website'))
        domain = self.clean_string(row.get('domain'))
        email_1 = self.clean_string(row.get('email_1'))
        email_2 = self.clean_string(row.get('email_2'))
        
        # Location Information
        address = self.clean_string(
            row.get('full_address') or row.get('business_address') or 
            row.get('address') or row.get('Address')
        )
        city = self.clean_string(row.get('city') or row.get('City'))
        state = self.clean_string(
            row.get('stateName') or row.get('state') or 
            row.get('us_state') or row.get('State')
        )
        postal_code = self.clean_string(row.get('postal_code') or row.get('Postal'))
        street = self.clean_string(row.get('street'))
        borough = self.clean_string(row.get('borough'))
        country = self.clean_string(row.get('country'))
        country_code = self.clean_string(row.get('country_code'))
        
        # Place Type & Category
        place_type = self.clean_string(row.get('type'))
        subtypes = self.parse_array_field(row.get('subtypes'))
        category = self.clean_string(row.get('category'))
        
        # Location Technical
        time_zone = self.clean_string(row.get('time_zone'))
        plus_code = self.clean_string(row.get('plus_code'))
        located_in = self.clean_string(row.get('located_in'))
        located_google_id = self.clean_string(row.get('located_google_id'))
        
        # Reviews & Ratings
        rating = self.parse_number(row.get('rating'))
        reviews = self.parse_number(row.get('reviews'))
        reviews_link = self.clean_string(row.get('reviews_link'))
        reviews_per_score = self.parse_json_field(row.get('reviews_per_score'))
        reviews_tags = self.parse_array_field(row.get('reviews_tags'))
        
        # Photos
        photos_count = self.parse_number(row.get('photos_count'))
        photo = self.clean_string(row.get('photo'))
        street_view = self.clean_string(row.get('street_view'))
        
        # Business Hours & Status
        working_hours = self.parse_json_field(row.get('working_hours'))
        working_hours_csv = self.clean_string(row.get('working_hours_csv_compat'))
        popular_times = self.parse_json_field(row.get('popular_times'))
        business_status = self.clean_string(row.get('business_status'))
        
        # Business Details
        about = self.clean_string(row.get('about'))
        price_range = self.clean_string(row.get('range'))
        description = self.clean_string(row.get('description'))
        posts = self.parse_json_field(row.get('posts'))
        verified = self.parse_boolean(row.get('verified'))
        area_service = self.parse_boolean(row.get('area_service'))
        
        # Links
        location_link = self.clean_string(row.get('location_link'))
        reservation_links = self.clean_string(row.get('reservation_links'))
        booking_link = self.clean_string(row.get('booking_appointment_link'))
        menu_link = self.clean_string(row.get('menu_link'))
        order_links = self.clean_string(row.get('order_links'))
        
        # Owner (Google Maps)
        owner_id = self.clean_string(row.get('owner_id'))
        owner_title = self.clean_string(row.get('owner_title'))
        owner_link = self.clean_string(row.get('owner_link'))
        
        # License Status
        status = self.clean_string(
            row.get('license_status') or row.get('status') or row.get('Status')
        )
        
        # Determine license type and smoke shop
        license_type = row.get('license_type') or row.get('type')
        if not license_type:
            license_type = self.determine_license_type(business_name)
        else:
            license_type = self.clean_string(license_type)
        
        smoke_shop = self.parse_boolean(row.get('smoke_shop'))
        if not smoke_shop:
            smoke_shop = self.is_smoke_shop(business_name)
        
        # Parse dates
        issue_date = self.parse_date(row.get('issue_date'))
        expiration_date = self.parse_date(row.get('expiration_date'))
        
        # Map status
        if status:
            if status.lower() in ['open', 'active']:
                license_status = 'Active'
            elif status.lower() in ['closed', 'inactive']:
                license_status = 'Inactive'
            else:
                license_status = status
        else:
            license_status = 'Active'
        
        # Parse location
        location_dict = {}
        lat = row.get('latitude') or row.get('lat')
        lng = row.get('longitude') or row.get('lng') or row.get('long')
        
        if lat and lng:
            coordinates = self.parse_coordinates(lat, lng)
            if coordinates:
                location_dict = {
                    'type': 'Point',
                    'coordinates': coordinates
                }
        
        # Create the enhanced document
        document = {
            # Google Maps Identifiers
            'googlePlaceId': place_id or self.clean_string(row.get('googlePlaceId')),
            'place_id': place_id,
            'google_id': google_id,
            'cid': self.clean_string(row.get('cid')),
            'kgmid': self.clean_string(row.get('kgmid')),
            'reviews_id': self.clean_string(row.get('reviews_id')),
            
            # Basic Business Information
            'business_name': business_name,
            'license_number': license_number,
            'type': place_type,
            'subtypes': subtypes,
            'category': category,
            
            # Location
            'stateName': state,
            'city': city,
            'business_address': address,
            'street': street,
            'borough': borough,
            'postal_code': postal_code,
            'country': country,
            'country_code': country_code,
            'time_zone': time_zone,
            'plus_code': plus_code,
            
            # Contact Information
            'contact_information': {
                'phone': phone,
                'email': email,
                'website': website,
                'domain': domain
            },
            'email_1': email_1,
            'email_2': email_2,
            
            # Location Data
            'location': location_dict,
            'latitude': self.parse_number(lat),
            'longitude': self.parse_number(lng),
            
            # Parent Location
            'located_in': located_in,
            'located_google_id': located_google_id,
            
            # Reviews & Ratings
            'rating': rating,
            'reviews': reviews,
            'reviews_link': reviews_link,
            'reviews_per_score': reviews_per_score,
            'reviews_tags': reviews_tags,
            
            # Photos
            'photos_count': photos_count,
            'photo': photo,
            'street_view': street_view,
            
            # Business Hours & Status
            'working_hours': working_hours,
            'working_hours_csv_compat': working_hours_csv,
            'popular_times': popular_times,
            'business_status': business_status,
            
            # Business Details
            'about': about,
            'range': price_range,
            'description': description,
            'posts': posts,
            'verified': verified,
            'area_service': area_service,
            
            # Links
            'location_link': location_link,
            'reservation_links': reservation_links,
            'booking_appointment_link': booking_link,
            'menu_link': menu_link,
            'order_links': order_links,
            
            # Owner (Google Maps)
            'owner_id': owner_id,
            'owner_title': owner_title,
            'owner_link': owner_link,
            
            # License Owner
            'owner': {
                'name': self.clean_string(row.get('operator_name') or row.get('owner_name')),
                'email': self.clean_string(row.get('owner_email')),
                'role': self.clean_string(row.get('owner_role')),
                'phone': self.clean_string(row.get('owner_phone')),
                'govt_issued_id': self.clean_string(row.get('govt_issued_id'))
            },
            'operator_name': self.clean_string(row.get('operator_name')),
            
            # License Information
            'issue_date': issue_date,
            'expiration_date': expiration_date,
            'license_type': license_type,
            'license_status': license_status,
            'jurisdiction': self.clean_string(row.get('jurisdiction')),
            'regulatory_body': self.clean_string(row.get('regulatory_body')),
            'entity_type': [license_type] if license_type else [],
            'filing_documents_url': self.clean_string(row.get('filing_documents_url')),
            'license_conditions': [],
            
            # Claim Information
            'claimed': self.parse_boolean(row.get('claimed')),
            'claimedBy': None,
            'claimedAt': None,
            
            # Verification
            'canojaVerified': self.parse_boolean(row.get('canojaVerified')),
            'adminVerificationRequired': self.parse_boolean(row.get('adminVerificationRequired')),
            'featured': self.parse_boolean(row.get('featured')),
            'dba': self.clean_string(row.get('dba')) or business_name,
            
            # Documents
            'state_license_document': self.clean_string(row.get('state_license_document')),
            'utility_bill': self.clean_string(row.get('utility_bill')),
            'gps_validation': self.parse_boolean(row.get('gps_validation')),
            
            # Classification
            'smoke_shop': smoke_shop
        }
        
        return document
    
    def process_all_files(self) -> List[Dict[str, Any]]:
        """Process all Excel files and return list of documents"""
        dataframes = self.load_excel_files()
        
        if not dataframes:
            return []
        
        all_documents = []
        
        for idx, df in enumerate(dataframes):
            print(f"\nProcessing DataFrame {idx + 1}/{len(dataframes)}")
            
            for row_idx, row in df.iterrows():
                try:
                    document = self.transform_row_to_document(row)
                    all_documents.append(document)
                except Exception as e:
                    print(f"Error processing row {row_idx}: {e}")
                    continue
            
            print(f"Processed {len(df)} rows from DataFrame {idx + 1}")
        
        print(f"\nTotal documents processed: {len(all_documents)}")
        return all_documents
    
    def insert_to_mongodb(self, documents: List[Dict[str, Any]], skip_duplicates: bool = True):
        """Insert documents into MongoDB"""
        if not documents:
            print("No documents to insert")
            return
        
        try:
            print(f"Connecting to MongoDB: {self.connection_string}")
            client = MongoClient(self.connection_string)
            db = client[self.database_name]
            collection = db[self.collection_name]
            
            print(f"Connected to database: {self.database_name}")
            print(f"Collection: {self.collection_name}")
            
            inserted_count = 0
            skipped_count = 0
            error_count = 0
            
            for doc in documents:
                try:
                    # Check for duplicates by license_number or place_id
                    if skip_duplicates:
                        query = {}
                        if doc.get('license_number'):
                            query['license_number'] = doc['license_number']
                        elif doc.get('place_id'):
                            query['place_id'] = doc['place_id']
                        
                        if query:
                            existing = collection.find_one(query)
                            if existing:
                                skipped_count += 1
                                if skipped_count % 100 == 0:
                                    print(f"Skipped {skipped_count} duplicates...")
                                continue
                    
                    # Insert document
                    collection.insert_one(doc)
                    inserted_count += 1
                    
                    if inserted_count % 100 == 0:
                        print(f"Inserted {inserted_count} documents...")
                
                except Exception as e:
                    error_count += 1
                    print(f"Error inserting document: {e}")
            
            print(f"\n=== Import Complete ===")
            print(f"Total documents processed: {len(documents)}")
            print(f"Successfully inserted: {inserted_count}")
            print(f"Skipped (duplicates): {skipped_count}")
            print(f"Errors: {error_count}")
            
            # Get final count
            final_count = collection.count_documents({})
            print(f"Total records in collection: {final_count}")
            
            client.close()
            print("MongoDB connection closed")
            
        except Exception as e:
            print(f"Error connecting to MongoDB: {e}")
    
    def save_to_json(self, documents: List[Dict[str, Any]], output_file: str = 'seed_data.json'):
        """Save documents to JSON file for backup"""
        try:
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(documents, f, indent=2, ensure_ascii=False, default=str)
            print(f"Data saved to {output_file}")
        except Exception as e:
            print(f"Error saving to JSON: {e}")
    
    def print_sample_data(self, documents: List[Dict[str, Any]], num_samples: int = 3):
        """Print sample data for verification"""
        print(f"\n=== Sample of {min(num_samples, len(documents))} Records ===")
        for i, doc in enumerate(documents[:num_samples]):
            print(f"\nRecord {i + 1}:")
            print(f"  Business Name: {doc.get('business_name')}")
            print(f"  License Number: {doc.get('license_number')}")
            print(f"  Place ID: {doc.get('place_id')}")
            print(f"  Type: {doc.get('type')}")
            print(f"  Category: {doc.get('category')}")
            print(f"  City: {doc.get('city')}, {doc.get('stateName')}")
            print(f"  Address: {doc.get('business_address')}")
            print(f"  Rating: {doc.get('rating')} ({doc.get('reviews')} reviews)")
            print(f"  Phone: {doc.get('contact_information', {}).get('phone')}")
            print(f"  Website: {doc.get('contact_information', {}).get('website')}")
            print(f"  License Type: {doc.get('license_type')}")
            print(f"  License Status: {doc.get('license_status')}")
            print(f"  Business Status: {doc.get('business_status')}")
            print(f"  Smoke Shop: {doc.get('smoke_shop')}")
            print("-" * 80)
    
    def get_summary_stats(self, documents: List[Dict[str, Any]]):
        """Print summary statistics"""
        print(f"\n=== Summary Statistics ===")
        print(f"Total Records: {len(documents)}")
        
        cities = {}
        license_types = {}
        statuses = {}
        states = {}
        categories = {}
        ratings_count = 0
        ratings_sum = 0
        
        for doc in documents:
            city = doc.get('city', 'Unknown')
            cities[city] = cities.get(city, 0) + 1
            
            license_type = doc.get('license_type', 'Unknown')
            license_types[license_type] = license_types.get(license_type, 0) + 1
            
            status = doc.get('license_status', 'Unknown')
            statuses[status] = statuses.get(status, 0) + 1
            
            state = doc.get('stateName', 'Unknown')
            states[state] = states.get(state, 0) + 1
            
            category = doc.get('category', 'Unknown')
            categories[category] = categories.get(category, 0) + 1
            
            if doc.get('rating'):
                ratings_count += 1
                ratings_sum += doc.get('rating', 0)
        
        print(f"\nStates/Provinces:")
        for state, count in sorted(states.items(), key=lambda x: x[1], reverse=True):
            print(f"  {state}: {count}")
        
        print(f"\nTop 10 Cities:")
        for city, count in sorted(cities.items(), key=lambda x: x[1], reverse=True)[:10]:
            print(f"  {city}: {count}")
        
        print(f"\nTop Categories:")
        for category, count in sorted(categories.items(), key=lambda x: x[1], reverse=True)[:10]:
            print(f"  {category}: {count}")
        
        print(f"\nLicense Types:")
        for license_type, count in sorted(license_types.items(), key=lambda x: x[1], reverse=True):
            print(f"  {license_type}: {count}")
        
        print(f"\nLicense Status:")
        for status, count in sorted(statuses.items(), key=lambda x: x[1], reverse=True):
            print(f"  {status}: {count}")
        
        if ratings_count > 0:
            avg_rating = ratings_sum / ratings_count
            print(f"\nRatings:")
            print(f"  Places with ratings: {ratings_count}")
            print(f"  Average rating: {avg_rating:.2f}")


def run_seeder():
    """Main function to run the seeder"""
    
    # Configuration
    FOLDER_PATH = r"C:\Users\HP\Downloads\can,us,usvi"  # Update this path
    MONGODB_URI = "mongodb://localhost:27017/"  # Update this
    DATABASE_NAME = "cannabis_licenses"
    
    # Initialize seeder
    seeder = CannabisLicenseSeeder(
        folder_path=FOLDER_PATH,
        connection_string=MONGODB_URI,
        database_name=DATABASE_NAME
    )
    
    # Process all files
    print("Starting data processing...")
    documents = seeder.process_all_files()
    
    if not documents:
        print("No documents to process. Exiting.")
        return
    
    # Print sample data
    seeder.print_sample_data(documents, 3)
    
    # Print summary statistics
    seeder.get_summary_stats(documents)
    
    # Save to JSON (optional backup)
    # seeder.save_to_json(documents, 'backup_seed_data.json')
    
    # Insert to MongoDB
    print("\nInserting data to MongoDB...")
    seeder.insert_to_mongodb(documents, skip_duplicates=True)
    
    print("\nSeeding complete!")


if __name__ == "__main__":
    run_seeder()